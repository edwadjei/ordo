export abstract class OtpDelivery {
  abstract send(contact: string, code: string): Promise<void>;
  abstract available(): boolean;
}
