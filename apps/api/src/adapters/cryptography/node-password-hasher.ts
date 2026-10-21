import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { PasswordHasher } from '../../capabilities/password-hasher.contract.js';

const scrypt = promisify(scryptCallback);

export class NodePasswordHasher extends PasswordHasher {
  async hash(password: string) {
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt:${salt}:${hash.toString('hex')}`;
  }

  async verify(password: string, encoded: string) {
    const [algorithm, salt, stored] = encoded.split(':');
    if (algorithm !== 'scrypt' || !salt || !stored) return false;
    const result = (await scrypt(password, salt, 64)) as Buffer;
    const expected = Buffer.from(stored, 'hex');
    return (
      expected.length === result.length && timingSafeEqual(result, expected)
    );
  }
}
