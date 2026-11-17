import { compactVerify, decodeProtectedHeader, importJWK, type JWK } from 'jose';
// Same registry client version as verifier-core (supports dcc-legacy and oidf registries)
import { RegistryClient } from 'issuer-registry-client-core';
import { checkStatus } from '@digitalcredentials/vc-bitstring-status-list';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { DataIntegrityProof } from '@digitalcredentials/data-integrity';
import { cryptosuite as eddsaRdfc2022CryptoSuite } from '@digitalcredentials/eddsa-rdfc-2022-cryptosuite';
import { securityLoader } from '@digitalcredentials/security-document-loader';
import type { KnownRegistry } from './knownRegistries';

// Verifies a credential secured as a compact JWS (VC-JWT, e.g. a baked Open Badges 3.0 PNG).
// Returns the same shape as @digitalcredentials/verifier-core: { credential, log } or { errors }.

const ALGORITHMS = ['ES256', 'ES384', 'ES512', 'EdDSA'];
const FETCH_TIMEOUT_MS = 10_000;
const registryClient = new RegistryClient();
const documentLoader = securityLoader({ fetchRemoteContexts: true }).build();
const statusSuites = [new Ed25519Signature2020(), new DataIntegrityProof({ cryptosuite: eddsaRdfc2022CryptoSuite })];

class JwtVerificationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

function didWebToUrl(did: string): string {
  const parts = did.slice('did:web:'.length).split(':').map(decodeURIComponent);
  const [host, ...path] = parts;
  if (!host) throw new JwtVerificationError(`Invalid did:web identifier: ${did}`, 'did_web_unresolved');
  return path.length
    ? `https://${host}/${path.join('/')}/did.json`
    : `https://${host}/.well-known/did.json`;
}

async function resolvePublicKey(kid: string, alg: string) {
  const [did, fragment] = kid.split('#');
  if (!did.startsWith('did:web:')) {
    throw new JwtVerificationError(`Unsupported key identifier "${kid}". Only did:web keys are supported.`, 'did_web_unresolved');
  }
  const url = didWebToUrl(did);
  let didDocument: any;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: 'application/did+json, application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    didDocument = await response.json();
  } catch {
    throw new JwtVerificationError(`The signature could not be checked because the public signing key could not be retrieved from ${url}`, 'did_web_unresolved');
  }
  const method = (didDocument.verificationMethod ?? []).find(
    (m: any) => m.id === kid || (fragment && (m.id === `#${fragment}` || m.id === `${did}#${fragment}`))
  );
  if (!method?.publicKeyJwk) {
    throw new JwtVerificationError(`No public key (publicKeyJwk) found for "${kid}" in ${url}`, 'did_web_unresolved');
  }
  return { did, key: await importJWK(method.publicKeyJwk as JWK, alg) };
}

function dateOrNull(value: unknown): Date | null {
  if (typeof value === 'number') return new Date(value * 1000);
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function checkDates(claims: any, credential: any): boolean {
  const now = new Date();
  const from = dateOrNull(credential.validFrom ?? credential.issuanceDate ?? claims.nbf);
  const until = dateOrNull(credential.validUntil ?? credential.expirationDate ?? claims.exp);
  if (from && now < from) return false;
  if (until && now > until) return false;
  return true;
}

async function checkRevocation(credential: any) {
  if (!credential.credentialStatus) return null;
  const types = [credential.credentialStatus].flat().map((s: any) => s?.type);
  // Older status list formats are ignored, as in verifier-core
  if (!types.includes('BitstringStatusListEntry')) return null;
  const result: any = await checkStatus({ credential, documentLoader, suite: statusSuites, verifyMatchingIssuers: false } as any);
  if (result?.error) {
    const message = result.error?.cause?.message ?? result.error?.message ?? '';
    // Mirror verifier-core: an unreachable status list is reported, not treated as revoked
    return { id: 'revocation_status', error: { name: 'status_list_not_found', message } };
  }
  return { id: 'revocation_status', valid: result?.verified === true };
}

export async function verifyJwtCredential(jwt: string, knownDIDRegistries: KnownRegistry[]) {
  let credential: any = undefined;
  try {
    let header;
    try {
      header = decodeProtectedHeader(jwt);
    } catch {
      throw new JwtVerificationError('The credential is not a valid JWT.', 'invalid_jwt');
    }
    if (!header.alg || !ALGORITHMS.includes(header.alg)) {
      throw new JwtVerificationError(`Unsupported signature algorithm "${header.alg}".`, 'invalid_signature');
    }
    if (!header.kid) {
      throw new JwtVerificationError('The JWT has no "kid" identifying the signing key.', 'invalid_signature');
    }
    const { did, key } = await resolvePublicKey(header.kid, header.alg);

    let payloadBytes: Uint8Array;
    try {
      ({ payload: payloadBytes } = await compactVerify(jwt, key, { algorithms: [header.alg] }));
    } catch {
      throw new JwtVerificationError('The signature is not valid.', 'invalid_signature');
    }
    const claims = JSON.parse(new TextDecoder().decode(payloadBytes));
    credential = claims.vc ?? claims;

    const issuerDid = typeof credential.issuer === 'string' ? credential.issuer : credential.issuer?.id;
    if (issuerDid !== did) {
      throw new JwtVerificationError(`The signing key belongs to ${did}, which is not the credential issuer (${issuerDid}).`, 'invalid_signature');
    }

    const log: any[] = [
      { id: 'valid_signature', valid: true },
      { id: 'expiration', valid: checkDates(claims, credential) },
    ];

    try {
      const revocation = await checkRevocation(credential);
      if (revocation) log.push(revocation);
    } catch (err) {
      log.push({ id: 'revocation_status', error: { name: 'status_list_not_found', message: String(err) } });
    }

    await registryClient.use({ registries: knownDIDRegistries as any });
    const { matchingIssuers, uncheckedRegistries } = await registryClient.lookupIssuersFor(issuerDid);
    log.push({ id: 'registered_issuer', valid: !!matchingIssuers.length, matchingIssuers, uncheckedRegistries });

    return { credential: { ...credential, jwt }, log };
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return { credential, errors: [{ name: err.code, message: err.message }] };
    }
    console.warn(err);
    return { credential, errors: [{ name: 'unknown_error', message: 'Could not verify credential.', stackTrace: err }] };
  }
}
