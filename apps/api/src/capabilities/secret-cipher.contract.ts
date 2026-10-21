export abstract class SecretCipher {
  abstract encrypt(owner: string, plaintext: string): Promise<string>;
  abstract decrypt(owner: string, ciphertext: string): Promise<string>;
}
