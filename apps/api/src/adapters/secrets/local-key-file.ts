import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fromHex, randomBytes } from '../cryptography/encoding.js';

/**
 * A 32-byte master key from a 64-hex-character environment value, or, for
 * local development only, from a lazily generated owner-only (0600) key file.
 * This is the only Node-specific part of key handling; a runtime without a
 * file system passes the environment key directly to the Web Crypto adapter.
 */
export function environmentKey(value: string, invalidMessage: string) {
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new Error(invalidMessage);
  return fromHex(value);
}

export function localKeySource(
  filename: string,
  environmentValue: string | undefined,
  invalidMessage: string,
) {
  return async (): Promise<Uint8Array> => {
    if (environmentValue)
      return environmentKey(environmentValue, invalidMessage);
    await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
    try {
      const key = await readFile(filename);
      if (key.length !== 32) throw new Error(invalidMessage);
      await chmod(filename, 0o600);
      return new Uint8Array(key);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const key = randomBytes(32);
    try {
      await writeFile(filename, key, { mode: 0o600, flag: 'wx' });
      return key;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await readFile(filename);
      if (existing.length !== 32) throw new Error(invalidMessage);
      return new Uint8Array(existing);
    }
  };
}
