import type { SearchRepository } from './search.repository.js';
export class SearchService {
  constructor(private readonly repository: SearchRepository) {}
  search(owner: string, query: string) {
    return this.repository.search(owner, query);
  }
}
