import { DCC_KNOWN_REGISTRIES_URL, EXTRA_KNOWN_REGISTRIES } from './config';

export type KnownRegistry = {
  name: string;
  type: 'dcc-legacy' | 'oidf' | string;
  governanceUrl?: string;
  url?: string;           // dcc-legacy: JSON file of issuers keyed by DID
  trustAnchorEC?: string; // oidf: OpenID Federation trust anchor
};

export type LegacyIssuerEntry = {
  name?: string;
  url?: string;
  location?: string;
};

/**
 * DCC's shared registry list plus our own. If the DCC list can't be fetched,
 * fall back to our registries alone rather than failing verification.
 */
export async function getKnownDIDRegistries(): Promise<KnownRegistry[]> {
  let dccRegistries: KnownRegistry[] = [];
  try {
    const response = await fetch(DCC_KNOWN_REGISTRIES_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (Array.isArray(json)) dccRegistries = json;
  } catch (err) {
    console.warn('Could not load DCC known registries:', err);
  }
  return [...dccRegistries, ...EXTRA_KNOWN_REGISTRIES];
}

/** Fetches a dcc-legacy registry file and returns its issuers keyed by DID. */
export async function fetchLegacyRegistryEntries(url: string): Promise<Record<string, LegacyIssuerEntry>> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  if (!json || typeof json.registry !== 'object' || json.registry === null) {
    throw new Error('File has no "registry" object');
  }
  return json.registry;
}
