import { SessionTokens } from '../../capabilities/session-tokens.contract.js';
import { randomBytes, sha256Hex, toHex } from './encoding.js';

/** 32 random bytes as hex; stored as the SHA-256 hex digest of that token. */
export class WebSessionTokens extends SessionTokens {
  create() {
    return toHex(randomBytes(32));
  }
  digest(token: string) {
    return sha256Hex(token);
  }
}
