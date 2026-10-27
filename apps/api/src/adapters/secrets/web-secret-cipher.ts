import { SecretCipher } from '../../capabilities/secret-cipher.contract.js';
import {
  fromBase64,
  randomBytes,
  toBase64,
  utf8Bytes,
  utf8Text,
  type WebCryptoKey,
} from '../cryptography/encoding.js';

const TAG_BYTES = 16;
const INVALID = 'Invalid encrypted credential';

/**
 * AES-256-GCM through Web Crypto. Ciphertext format (unchanged from the
 * former Node implementation): `v1.<nonce b64>.<tag b64>.<data b64>` with a
 * 96-bit nonce and `ordo.audio:<owner>` as additional authenticated data.
 * Web Crypto appends the 16-byte tag to the data, so it is split and joined.
 */
export class WebSecretCipher extends SecretCipher {
  private keyPromise?: Promise<WebCryptoKey>;

  constructor(private readonly keySource: () => Promise<Uint8Array>) {
    super();
  }

  private key() {
    return (this.keyPromise ??= this.keySource()
      .then((raw) =>
        crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
          'encrypt',
          'decrypt',
        ]),
      )
      .catch((error) => {
        this.keyPromise = undefined;
        throw error;
      }));
  }

  async encrypt(owner: string, plaintext: string) {
    const key = await this.key();
    const nonce = randomBytes(12);
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: nonce,
          additionalData: utf8Bytes(`ordo.audio:${owner}`),
          tagLength: TAG_BYTES * 8,
        },
        key,
        utf8Bytes(plaintext),
      ),
    );
    const data = sealed.subarray(0, sealed.length - TAG_BYTES);
    const tag = sealed.subarray(sealed.length - TAG_BYTES);
    return ['v1', toBase64(nonce), toBase64(tag), toBase64(data)].join('.');
  }

  async decrypt(owner: string, ciphertext: string) {
    const [version, nonce, tag, data, ...extra] = ciphertext.split('.');
    if (version !== 'v1' || !nonce || !tag || !data || extra.length)
      throw new Error(INVALID);
    const key = await this.key();
    let nonceBytes: Uint8Array, tagBytes: Uint8Array, dataBytes: Uint8Array;
    try {
      nonceBytes = fromBase64(nonce);
      tagBytes = fromBase64(tag);
      dataBytes = fromBase64(data);
    } catch {
      throw new Error(INVALID);
    }
    if (nonceBytes.length !== 12 || tagBytes.length !== TAG_BYTES)
      throw new Error(INVALID);
    const sealed = new Uint8Array(dataBytes.length + TAG_BYTES);
    sealed.set(dataBytes);
    sealed.set(tagBytes, dataBytes.length);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonceBytes,
        additionalData: utf8Bytes(`ordo.audio:${owner}`),
        tagLength: TAG_BYTES * 8,
      },
      key,
      sealed,
    );
    return utf8Text(new Uint8Array(plaintext));
  }
}
