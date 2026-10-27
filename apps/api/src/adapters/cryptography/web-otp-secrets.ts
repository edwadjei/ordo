import { OtpSecrets } from '../../capabilities/otp-secrets.contract.js';
import { fromHex, toHex, utf8Bytes, type WebCryptoKey } from './encoding.js';

const PREFIX = 'hmac-sha256:';
const CODE_SPACE = 1_000_000;
// Largest multiple of the code space that fits in a uint32; values at or above
// it are redrawn so every six-digit code is equally likely (no modulo bias).
const UNBIASED_LIMIT = 2 ** 32 - (2 ** 32 % CODE_SPACE);

/**
 * Six-digit codes from getRandomValues, stored as
 * `hmac-sha256:<hex HMAC-SHA256("challengeId:code", key)>`.
 */
export class WebOtpSecrets extends OtpSecrets {
  private keyPromise?: Promise<WebCryptoKey>;

  constructor(private readonly keySource: () => Promise<Uint8Array>) {
    super();
  }

  private key() {
    return (this.keyPromise ??= this.keySource()
      .then((raw) =>
        crypto.subtle.importKey(
          'raw',
          raw,
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign', 'verify'],
        ),
      )
      .catch((error) => {
        this.keyPromise = undefined;
        throw error;
      }));
  }

  code() {
    const sample = new Uint32Array(1);
    do crypto.getRandomValues(sample);
    while (sample[0] >= UNBIASED_LIMIT);
    return (sample[0] % CODE_SPACE).toString().padStart(6, '0');
  }

  async hash(challengeId: string, code: string) {
    const signature = await crypto.subtle.sign(
      'HMAC',
      await this.key(),
      utf8Bytes(`${challengeId}:${code}`),
    );
    return `${PREFIX}${toHex(signature)}`;
  }

  async verify(challengeId: string, code: string, stored: string) {
    if (!stored.startsWith(PREFIX)) return false;
    const hex = stored.slice(PREFIX.length);
    if (!/^[a-f0-9]{64}$/.test(hex)) return false;
    // HMAC verification through Web Crypto compares in constant time.
    return crypto.subtle.verify(
      'HMAC',
      await this.key(),
      fromHex(hex),
      utf8Bytes(`${challengeId}:${code}`),
    );
  }
}
