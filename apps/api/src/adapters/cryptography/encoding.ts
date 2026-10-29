// Runtime-neutral byte encodings for the Web Crypto adapters. They use only
// globals that Node 22 and Cloudflare Workers both provide (TextEncoder, btoa,
// atob), so no adapter needs Node's Buffer.
import { fillRandom } from '../../platform/identifiers/random.js';

/** The global Web Crypto key type, without pulling in DOM typings. */
export type WebCryptoKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

const utf8 = new TextEncoder();
const utf8Decoder = new TextDecoder();

export const utf8Bytes = (value: string) => utf8.encode(value);
export const utf8Text = (bytes: Uint8Array) => utf8Decoder.decode(bytes);

export function toHex(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let result = '';
  for (const byte of view) result += byte.toString(16).padStart(2, '0');
  return result;
}

export function fromHex(hex: string) {
  if (hex.length % 2 !== 0 || !/^[a-fA-F0-9]*$/.test(hex))
    throw new Error('Invalid hex value');
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index++)
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

export function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function randomBytes(length: number) {
  return fillRandom(new Uint8Array(length));
}

export async function sha256Hex(content: string) {
  return toHex(await crypto.subtle.digest('SHA-256', utf8Bytes(content)));
}
