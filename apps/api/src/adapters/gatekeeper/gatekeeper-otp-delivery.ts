import { OtpDelivery } from '../../capabilities/otp-delivery.contract.js';

// Gatekeeper is a transport only. Ordo owns expiry, attempt limits and verification.
export class GatekeeperOtpDelivery extends OtpDelivery {
  constructor(
    private readonly settings: {
      apiKey?: string;
      apiUrl?: string;
      senderId?: string;
    },
    private readonly transport: typeof fetch = fetch,
  ) {
    super();
  }
  available() {
    return Boolean(this.settings.apiKey && this.settings.apiUrl);
  }
  async send(contact: string, code: string) {
    if (!this.available()) throw new Error('Delivery unavailable');
    const message = `Your Ordo sign-in code is ${code}. It expires in 5 minutes. If you did not request this code, ignore this message.`;
    const phone = contact.startsWith('+');
    const response = await this.transport(
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
                subject: 'Your Ordo sign-in code',
                message,
                isHtml: false,
              },
        ),
        signal: AbortSignal.timeout(20000),
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
      throw new Error('Delivery failed');
  }
}
