import { OtpDelivery } from '../../capabilities/otp-delivery.contract.js';

/** Hides most of an email local part or phone number in the console line. */
export function maskContact(contact: string) {
  if (contact.startsWith('+'))
    return `${contact.slice(0, 4)}•••••${contact.slice(-2)}`;
  const [local, domain] = contact.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}

/**
 * Development-only code transport: prints the code to the `wrangler dev`
 * terminal instead of sending a message. It refuses to exist outside
 * `ORDO_ENV=development`, so a hosted Worker can never fall back to it.
 */
export class ConsoleOtpDelivery extends OtpDelivery {
  constructor(
    development: boolean,
    private readonly write: (line: string) => void = (line) =>
      console.log(line),
  ) {
    super();
    if (!development)
      throw new Error(
        'The console code transport is available only when ORDO_ENV=development.',
      );
  }
  available() {
    return true;
  }
  async send(contact: string, code: string) {
    this.write(
      `[ordo dev] Sign-in code for ${maskContact(contact)}: ${code} (development only; nothing was sent)`,
    );
  }
}
