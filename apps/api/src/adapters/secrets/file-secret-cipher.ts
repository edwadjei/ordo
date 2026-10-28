import { environmentKey, localKeySource } from './local-key-file.js';
import { WebSecretCipher } from './web-secret-cipher.js';

const INVALID = 'Invalid credential encryption configuration';

/**
 * Local wiring of the Web Crypto cipher: the master key is the
 * `ORDO_CREDENTIAL_KEY` value when set, otherwise an owner-only key file.
 */
export class FileSecretCipher extends WebSecretCipher {
  constructor(
    filename: string,
    private readonly environmentValue?: string,
  ) {
    super(localKeySource(filename, environmentValue, INVALID));
  }

  /**
   * A valid environment key, or the local key file (created on first use, so
   * checking never writes it).
   */
  async configured() {
    if (!this.environmentValue) return true;
    try {
      environmentKey(this.environmentValue, INVALID);
      return true;
    } catch {
      return false;
    }
  }
}
