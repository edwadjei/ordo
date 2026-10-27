export abstract class ContentHasher {
  abstract digest(content: string): Promise<string>;
}
