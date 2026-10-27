import { localKeySource } from './local-key-file.js';
import { WebSecretCipher } from './web-secret-cipher.js';

/**
 * Local wiring of the Web Crypto cipher: the master key is the
 * `ORDO_CREDENTIAL_KEY` value when set, otherwise an owner-only key file.
 */
export class FileSecretCipher extends WebSecretCipher {
  constructor(filename: string, environmentKey?: string) {
    super(
      localKeySource(
        filename,
        environmentKey,
        'Invalid credential encryption configuration',
      ),
    );
  }
}
