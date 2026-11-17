# Signing badges so they verify

The verifier looks up the key named in the proof's `verificationMethod` in the issuer's DID document. The signature only verifies if the key that signed the badge is the one the DID document publishes.

Example failure: a badge was signed with `z6MkgzMaB2o…`, but the DID document at `https://badges.deltlabs.net/.well-known/did.json` only listed `z6Mkv8FBZc5snygtdh5UTTsSwqnidVV3EPvoP2htE394zw2F` as its Ed25519 key. The verifier reports `invalid_signature: The signature is not valid.`

## 1. Pick one key and make both sides match

Use one Ed25519 key pair and make sure these three agree:

| Where | Value |
|---|---|
| Private key | Held by the issuer service. Never published. |
| `https://badges.deltlabs.net/.well-known/did.json` | A `verificationMethod` entry with `publicKeyMultibase` set to the public key. |
| Badge `proof.verificationMethod` | `did:web:badges.deltlabs.net#<same multibase string>` |

Two ways to fix a mismatch:

- **Use the key already published.** Sign with the private key for the published Ed25519 key. Set the proof's `verificationMethod` to `did:web:badges.deltlabs.net#<that key's multibase>`.
- **Publish the new key.** Add an entry to the DID document and include it in `assertionMethod`:
  ```json
  {
    "id": "did:web:badges.deltlabs.net#<multibase>",
    "type": "Ed25519VerificationKey2020",
    "controller": "did:web:badges.deltlabs.net",
    "publicKeyMultibase": "<multibase>"
  }
  ```

The DID document must be served over HTTPS and be publicly reachable.

## 2. Build the unsigned credential

- Include no `proof` field.
- `issuer.id` must be `did:web:badges.deltlabs.net`.
- Use the `https://www.w3.org/ns/credentials/v2` and OB 3.0.3 contexts.
- Set `validFrom` to now or earlier. A future date fails the validity check.
- Don't use `localhost` URLs (for example in `renderMethod`). Use public URLs.

## 3. Sign with `eddsa-rdfc-2022`

Untested sketch. Check package names and versions against the DCC libraries you use.

```js
import * as vc from '@digitalcredentials/vc';
import { DataIntegrityProof } from '@digitalcredentials/data-integrity';
import { cryptosuite } from '@digitalcredentials/eddsa-rdfc-2022-cryptosuite';
import { Ed25519VerificationKey2020 } from '@digitalcredentials/ed25519-verification-key-2020';
import { securityLoader } from '@digitalcredentials/security-document-loader';

const documentLoader = securityLoader().build();

const publicKeyMultibase = 'z6Mkv8FBZc5snygtdh5UTTsSwqnidVV3EPvoP2htE394zw2F';
const key = await Ed25519VerificationKey2020.from({
  id: `did:web:badges.deltlabs.net#${publicKeyMultibase}`,
  controller: 'did:web:badges.deltlabs.net',
  publicKeyMultibase,
  privateKeyMultibase: process.env.ISSUER_PRIVATE_KEY, // from a secret store, never in code
});

const suite = new DataIntegrityProof({ signer: key.signer(), cryptosuite });
const signed = await vc.issue({ credential: unsignedCredential, suite, documentLoader });
```

## 4. Bake into the PNG

- Store the signed JSON in an `iTXt` chunk with the keyword `openbadgecredential`.
- Don't change any field after signing, including dates and image URLs. Reformatting whitespace is fine.

## 5. Verify before sending

Upload the PNG to the verifier, or call `verifyCredential` from `@digitalcredentials/verifier-core`. The `valid_signature` check should pass. If it fails with `invalid_signature`, compare:

- The `verificationMethod` fragment against the DID document.
- The signing private key against the published public key.
