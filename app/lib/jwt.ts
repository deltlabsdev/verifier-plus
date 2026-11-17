// Helpers for credentials secured as compact JWS (VC-JWT), shared by client and server.
const COMPACT_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

export function isCompactJwt(text: string): boolean {
  return COMPACT_JWT.test(text.trim());
}

export function decodeBase64UrlJson(part: string): any {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Returns the credential carried by a compact JWT, with the original token kept
 * in `jwt` so the server can verify the signature. Display data comes from the
 * unverified payload; the server never trusts anything but the token itself.
 */
export function credentialFromJwt(jwt: string): Record<string, any> {
  const token = jwt.trim();
  const payload = decodeBase64UrlJson(token.split('.')[1]);
  const credential = payload.vc ?? payload;
  return { ...credential, jwt: token };
}

/** If `text` is a compact JWT, returns the credential as a JSON string. Otherwise returns `text` unchanged. */
export function normalizeBadgeText(text: string): string {
  if (!isCompactJwt(text)) return text;
  try {
    return JSON.stringify(credentialFromJwt(text));
  } catch {
    return text;
  }
}
