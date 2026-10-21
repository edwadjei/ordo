export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  abstract verify(password: string, encoded: string): Promise<boolean>;
}
