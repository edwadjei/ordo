import { AgentTokenSecrets } from '../../capabilities/agent-token-secrets.contract.js';
import {
  fromHex,
  randomBytes,
  toHex,
  utf8Bytes,
  type WebCryptoKey,
} from './encoding.js';

const PREFIX = 'hmac-sha256:';

/**
 * HMAC-SHA256 of `agent-token:<id>:<secret>` under the Worker's
 * `OTP_HMAC_KEY`. The `agent-token:` label keeps these hashes apart from the
 * sign-in code hashes made with the same key, so no new secret is needed.
 * The key is imported once per isolate.
 */
export class WebAgentTokenSecrets extends AgentTokenSecrets {
  private keyPromise?: Promise<WebCryptoKey>;
  constructor(private readonly keyBytes: Uint8Array) {
    super();
  }
  private key() {
    return (this.keyPromise ??= crypto.subtle
      .importKey(
        'raw',
        new Uint8Array(this.keyBytes),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
      )
      .catch((error) => {
        this.keyPromise = undefined;
        throw error;
      }));
  }
  newSecret() {
    // 32 random bytes, base64url without padding (43 characters).
    let binary = '';
    for (const byte of randomBytes(32)) binary += String.fromCharCode(byte);
    return btoa(binary)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
  }
  private message(tokenId: string, secret: string) {
    return utf8Bytes(`agent-token:${tokenId}:${secret}`);
  }
  async hash(tokenId: string, secret: string) {
    const signature = await crypto.subtle.sign(
      'HMAC',
      await this.key(),
      this.message(tokenId, secret),
    );
    return `${PREFIX}${toHex(signature)}`;
  }
  async verify(tokenId: string, secret: string, stored: string) {
    if (!stored.startsWith(PREFIX)) return false;
    const hex = stored.slice(PREFIX.length);
    if (!/^[a-f0-9]{64}$/.test(hex)) return false;
    // Web Crypto's HMAC verify compares in constant time.
    return crypto.subtle.verify(
      'HMAC',
      await this.key(),
      fromHex(hex),
      this.message(tokenId, secret),
    );
  }
}
