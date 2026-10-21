import { createHash, randomBytes } from 'node:crypto';
import { SessionTokens } from '../../capabilities/session-tokens.contract.js';

export class NodeSessionTokens extends SessionTokens {
  create() {
    return randomBytes(32).toString('hex');
  }
  digest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
