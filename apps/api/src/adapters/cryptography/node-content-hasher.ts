import { createHash } from 'node:crypto';
import { ContentHasher } from '../../capabilities/content-hasher.contract.js';

export class NodeContentHasher extends ContentHasher {
  digest(content: string) {
    return createHash('sha256').update(content).digest('hex');
  }
}
