import { ContentHasher } from '../../capabilities/content-hasher.contract.js';
import { sha256Hex } from './encoding.js';

/** SHA-256 hex of the UTF-8 content; identical to the former Node digest. */
export class WebContentHasher extends ContentHasher {
  digest(content: string) {
    return sha256Hex(content);
  }
}
