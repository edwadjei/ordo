import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { SecretCipher } from '../../capabilities/secret-cipher.contract.js';
export class FileSecretCipher extends SecretCipher {
  private keyPromise?: Promise<Buffer>;
  constructor(
    private readonly filename: string,
    private readonly environmentKey?: string,
  ) {
    super();
  }
  private key() {
    return (this.keyPromise ??= this.loadKey().catch((error) => {
      this.keyPromise = undefined;
      throw error;
    }));
  }
  private async loadKey() {
    if (this.environmentKey) {
      if (!/^[a-fA-F0-9]{64}$/.test(this.environmentKey))
        throw new Error('Invalid credential encryption configuration');
      return Buffer.from(this.environmentKey, 'hex');
    }
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 });
    try {
      const key = await readFile(this.filename);
      if (key.length !== 32)
        throw new Error('Invalid credential encryption configuration');
      await chmod(this.filename, 0o600);
      return key;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const key = randomBytes(32);
    try {
      await writeFile(this.filename, key, { mode: 0o600, flag: 'wx' });
      return key;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await readFile(this.filename);
      if (existing.length !== 32)
        throw new Error('Invalid credential encryption configuration');
      return existing;
    }
  }
  async encrypt(owner: string, plaintext: string) {
    const nonce = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', await this.key(), nonce);
    cipher.setAAD(Buffer.from(`ordo.audio:${owner}`));
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      nonce.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
  }
  async decrypt(owner: string, ciphertext: string) {
    const [version, nonce, tag, data, ...extra] = ciphertext.split('.');
    if (version !== 'v1' || !nonce || !tag || !data || extra.length)
      throw new Error('Invalid encrypted credential');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      await this.key(),
      Buffer.from(nonce, 'base64'),
    );
    decipher.setAAD(Buffer.from(`ordo.audio:${owner}`));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
