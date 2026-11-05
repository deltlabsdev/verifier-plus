// Extracts the credential embedded in a "baked" Open Badges PNG.
// OB 3.0 stores it in an iTXt chunk with keyword "openbadgecredential";
// OB 2.0 uses keyword "openbadges" (iTXt or tEXt), holding JSON, a JWS, or a URL.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const KEYWORDS = ['openbadgecredential', 'openbadges'];

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  // Copy into a plain ArrayBuffer-backed array; Blob rejects ArrayBufferLike views
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Returns the raw text stored under a badge keyword, or null if none is found.
 * Prefers "openbadgecredential" over "openbadges" when both are present.
 */
export async function extractBadgeFromPng(input: ArrayBuffer | Uint8Array): Promise<string | null> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!isPng(bytes)) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latin1 = new TextDecoder('latin1');
  const utf8 = new TextDecoder('utf-8');
  const found: Record<string, string> = {};

  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = latin1.decode(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;
    const data = bytes.subarray(dataStart, dataEnd);

    if (type === 'iTXt' || type === 'tEXt') {
      const kwEnd = data.indexOf(0);
      if (kwEnd > 0) {
        const keyword = latin1.decode(data.subarray(0, kwEnd));
        if (KEYWORDS.includes(keyword) && !(keyword in found)) {
          if (type === 'tEXt') {
            found[keyword] = latin1.decode(data.subarray(kwEnd + 1));
          } else {
            // iTXt: keyword\0 compressionFlag compressionMethod languageTag\0 translatedKeyword\0 text
            const compressed = data[kwEnd + 1] === 1;
            const langEnd = data.indexOf(0, kwEnd + 3);
            const transEnd = langEnd === -1 ? -1 : data.indexOf(0, langEnd + 1);
            if (transEnd !== -1) {
              let text = data.subarray(transEnd + 1);
              if (compressed) text = await inflate(text);
              found[keyword] = utf8.decode(text);
            }
          }
        }
      }
    }

    if (type === 'IEND') break;
    offset = dataEnd + 4; // skip CRC
  }

  for (const keyword of KEYWORDS) {
    if (keyword in found) return found[keyword].trim();
  }
  return null;
}
