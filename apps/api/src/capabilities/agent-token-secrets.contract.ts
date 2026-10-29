/**
 * Access-token secrets. A token is `ordo_pat_<id>_<secret>`; only a keyed
 * hash of the secret is stored, and checking one compares in constant time.
 */
export abstract class AgentTokenSecrets {
  /** A new random secret (URL-safe text). */
  abstract newSecret(): string;
  abstract hash(tokenId: string, secret: string): Promise<string>;
  abstract verify(
    tokenId: string,
    secret: string,
    stored: string,
  ): Promise<boolean>;
}
