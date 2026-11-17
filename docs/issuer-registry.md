# DeLT Labs issuer registry

VerifierPlus marks an issuer as *known* when the credential's `issuer.id` (its DID) is listed in one of the known issuer registries. By default the verifier only uses the registries listed by the Digital Credentials Consortium (DCC). This document explains how we added our own registry, hosted at `files.deltlabs.net`, so that credentials issued by DeLT Labs are recognised.

## How it works

At verification time, [`getKnownDIDRegistries()`](../app/lib/knownRegistries.ts) builds the list of registries passed to `verifierCore.verifyCredential()` in [`validate.ts`](../app/lib/validate.ts):

1. It fetches DCC's shared list from `DCC_KNOWN_REGISTRIES_URL`
   (`https://digitalcredentials.github.io/dcc-known-registries/known-did-registries.json`).
2. It appends our own registries from `EXTRA_KNOWN_REGISTRIES`.
3. If the DCC list can't be fetched, it logs a warning and continues with our registries alone. Verification still runs.

Before this change, `validate.ts` fetched the DCC list directly, so there was no way to add a registry of our own.

## Configuration

Both settings live in [`app/lib/config.ts`](../app/lib/config.ts):

```ts
export const DCC_KNOWN_REGISTRIES_URL =
  'https://digitalcredentials.github.io/dcc-known-registries/known-did-registries.json';

export const EXTRA_KNOWN_REGISTRIES = [
  {
    name: 'DeLT Labs Registry',
    type: 'dcc-legacy',
    governanceUrl: 'https://deltlabs.com',
    url: 'https://files.deltlabs.net/registry/registry.json',
  },
];
```

| Field | Meaning |
| --- | --- |
| `name` | Label shown on the result page and on `/registries`. |
| `type` | `dcc-legacy` means a static JSON file of issuers keyed by DID. The other type in the DCC list, `oidf` (OpenID Federation), uses `trustAnchorEC` instead of `url`. |
| `governanceUrl` | The organisation that runs the registry. |
| `url` | Where the registry file is served. |

To add another registry, append an entry with the same shape to `EXTRA_KNOWN_REGISTRIES`.

## The registry file

The file at `https://files.deltlabs.net/registry/registry.json` is not part of this repository. It is hosted separately and must be edited there. Its format is:

```json
{
  "meta": {
    "created": "2026-11-04T00:00:00+00:00",
    "updated": "2026-11-17T00:00:00+00:00"
  },
  "registry": {
    "did:web:eudilab.deltlabs.net": {
      "name": "DeLT Labs",
      "location": "Munich, Germany",
      "url": "https://deltlabs.com"
    },
    "did:web:badges.deltlabs.net": {
      "name": "DeLT Labs",
      "location": "Munich, Germany",
      "url": "https://badges.deltlabs.net"
    }
  }
}
```

Requirements:

- **Exact DID match.** Each key under `registry` must equal the credential's `issuer.id` exactly. A credential from `did:web:badges.deltlabs.net` is **not** covered by an entry for `did:web:eudilab.deltlabs.net`. Every issuing DID needs its own entry.
- **CORS.** Verification runs in the browser, so the file must be served with an `Access-Control-Allow-Origin` header (`files.deltlabs.net` sends `*`). Without it the browser blocks the request and the registry is silently skipped.
- **No redeploy needed.** The file is downloaded at runtime, not bundled into the app, so editing it doesn't require a new deploy. The `/registries` page fetches it with `cache: 'no-store'`. During verification it is fetched by verifier-core, so browser or CDN caching may delay changes briefly.

## Adding a new issuer

1. Find the DID in the credential's `issuer.id` field.
2. Add an entry for it under `registry` in the hosted `registry.json` and update `meta.updated`.
3. Open `/registries` in VerifierPlus, enter the DID in **Check DID** and confirm it is found in "DeLT Labs Registry".
4. Verify the credential again. The "isn't in a known issuer registry" warning should be gone.

## Troubleshooting

The `/registries` page ([`app/registries/page.tsx`](../app/registries/page.tsx)) lists every registry the verifier uses, with ours marked "added by this verifier", and shows the issuers in each `dcc-legacy` file.

| Symptom | Likely cause |
| --- | --- |
| "isn't in a known issuer registry", but the registry loads | The issuer's DID is missing from `registry.json`, or differs from `issuer.id` (check spelling, subdomain and `did:web` vs `did:key`). |
| "Could not download (network or CORS error)" on `/registries` | The file is unreachable or missing the `Access-Control-Allow-Origin` header. |
| "Could not read registry: File has no \"registry\" object" | The JSON is malformed or the top-level `registry` key is missing. |
| Only our registry is shown | The DCC list failed to load. Check the browser console for "Could not load DCC known registries". |

## Example: `did:web:badges.deltlabs.net`

The registry was first published with only `did:web:eudilab.deltlabs.net`. Badges issued from `did:web:badges.deltlabs.net` were therefore reported as not being in a known registry, even though the registry itself loaded correctly. The fix was to add a second entry for `did:web:badges.deltlabs.net` to the hosted file, as shown above. No code change was needed.
