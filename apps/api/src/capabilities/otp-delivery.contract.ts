export abstract class OtpDelivery {
  abstract send(contact: string, code: string): Promise<void>;
  abstract available(): boolean;
}

/**
 * Why a code could not be delivered, in terms safe to log: never the
 * contact, the code, the provider key or URL, or a provider response body.
 * `rejected` means the provider answered with an error (`status` is its HTTP
 * status); `timeout` and `network` mean the request did not complete
 * (`errorName` is the thrown error's name, such as `TypeError`).
 */
export interface OtpDeliveryFailure {
  reason: 'unavailable' | 'rejected' | 'timeout' | 'network';
  status?: number;
  errorName?: string;
}

/** The error a transport throws: a generic message plus the safe facts. */
export function otpDeliveryError(failure: OtpDeliveryFailure) {
  return Object.assign(new Error('Delivery failed'), { failure });
}

/** The safe facts of a transport error, when it carries them. */
export function otpDeliveryFailure(
  error: unknown,
): OtpDeliveryFailure | undefined {
  const failure =
    error instanceof Error
      ? (error as { failure?: OtpDeliveryFailure }).failure
      : undefined;
  return failure && typeof failure.reason === 'string' ? failure : undefined;
}
