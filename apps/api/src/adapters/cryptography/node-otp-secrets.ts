import { randomInt } from 'node:crypto';
import { OtpSecrets } from '../../capabilities/otp-secrets.contract.js';
export class NodeOtpSecrets extends OtpSecrets {
  code() {
    return randomInt(0, 1000000).toString().padStart(6, '0');
  }
}
