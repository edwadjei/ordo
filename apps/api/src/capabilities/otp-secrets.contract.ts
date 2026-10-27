export abstract class OtpSecrets {
  abstract code(): string;
  abstract hash(challengeId: string, code: string): Promise<string>;
  abstract verify(
    challengeId: string,
    code: string,
    stored: string,
  ): Promise<boolean>;
}
