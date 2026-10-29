import type { SearchRepository } from './search.repository.js';
export class SearchService {
  constructor(private readonly repository: SearchRepository) {}
  search(owner: string, query: string, includeArchived = false) {
    return this.repository.search(owner, query, includeArchived);
  }
}
