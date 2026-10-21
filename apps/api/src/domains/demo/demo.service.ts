import type { User } from '@ordo/core';
import type { DatabaseAdapter } from '../../adapters/database/database.adapter.js';
import type { HomeService } from '../home/home.service.js';
import { DemoRepository } from './demo.repository.js';

export class DemoService {
  constructor(
    private readonly repository: DemoRepository,
    private readonly transactions: DatabaseAdapter,
    private readonly home: HomeService,
  ) {}

  async load(user: User) {
    await this.transactions.forOwner(user.id, async (transaction) => {
      if (!(await this.repository.hasLoaded(user.id, transaction)))
        await this.repository.insert(user.id, transaction);
    });
    return this.home.snapshot(user);
  }
}
