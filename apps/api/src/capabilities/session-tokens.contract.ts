export abstract class SessionTokens {
  abstract create(): string;
  abstract digest(token: string): Promise<string>;
}
