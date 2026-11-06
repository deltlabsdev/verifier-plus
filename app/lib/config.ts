/**
 * General VerifierPlus app configuration
 */

// 10 mins in ms. Used in the 'Request Credential via Wallet' functionality
export const VC_API_EXCHANGE_TIMEOUT = 1000 * 60 * 10;

// Shared list of known issuer registries maintained by DCC
export const DCC_KNOWN_REGISTRIES_URL =
  'https://digitalcredentials.github.io/dcc-known-registries/known-did-registries.json';

// Registries checked in addition to the DCC list. 'dcc-legacy' registries are
// JSON files of the form { meta, registry: { [did]: { name, url, location } } }
// and must be served with an Access-Control-Allow-Origin header.
export const EXTRA_KNOWN_REGISTRIES = [
  {
    name: 'DeLT Labs Registry',
    type: 'dcc-legacy',
    governanceUrl: 'https://deltlabs.com',
    url: 'https://files.deltlabs.net/registry/registry.json',
  },
];
