import { ordoSignInEmail } from './ordo-sign-in-email.js';
import {
  OtpDelivery,
  otpDeliveryError,
} from '../../capabilities/otp-delivery.contract.js';

// Gatekeeper is a transport only. Ordo owns expiry, attempt limits and verification.
export class GatekeeperOtpDelivery extends OtpDelivery {
  constructor(
    private readonly settings: {
      apiKey?: string;
      apiUrl?: string;
      senderId?: string;
      emailHtml?: boolean;
    },
    // Workers throw "Illegal invocation" when the global fetch is called as
    // a method of another object, so the default calls it unbound.
    private readonly transport: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {
    super();
  }
  available() {
    return Boolean(this.settings.apiKey && this.settings.apiUrl);
  }
  async send(contact: string, code: string) {
    if (!this.available()) throw otpDeliveryError({ reason: 'unavailable' });
    const message = `Your Ordo sign-in code is ${code}. It expires in 5 minutes. If you did not request this code, ignore this message.`;
    const phone = contact.startsWith('+');
    const email = phone ? null : ordoSignInEmail(code);
    const response = await this.post(
      `${this.settings.apiUrl!.replace(/\/$/, '')}/${phone ? 'send_sms' : 'send_email'}`,
      {
        method: 'POST',
        headers: {
          'x-api-key': this.settings.apiKey!,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(
          phone
            ? {
                phoneNumber: `0${contact.slice(4)}`,
                message,
                ...(this.settings.senderId
                  ? { sender_id: this.settings.senderId }
                  : {}),
              }
            : {
                email: contact,
                subject: email!.subject,
                message:
                  this.settings.emailHtml === false ? email!.text : email!.html,
                isHtml: this.settings.emailHtml !== false,
              },
        ),
      },
    );
    const payload: unknown = await response.json().catch(() => null);
    // Never propagate provider bodies: they may echo a recipient, code or API key.
    if (
      !response.ok ||
      !payload ||
      typeof payload !== 'object' ||
      ('success' in payload && payload.success === false) ||
      ('error' in payload && payload.error != null)
    )
      throw otpDeliveryError({ reason: 'rejected', status: response.status });
  }
  private async post(url: string, init: RequestInit) {
    try {
      return await this.transport(url, {
        ...init,
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      const errorName = error instanceof Error ? error.name : typeof error;
      throw otpDeliveryError({
        reason: errorName === 'TimeoutError' ? 'timeout' : 'network',
        errorName,
      });
    }
  }
}
