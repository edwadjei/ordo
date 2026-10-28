import type { User } from '@ordo/core';
import type { HomeService } from '../home/home.service.js';
import { DemoRepository } from './demo.repository.js';

export class DemoService {
  constructor(
    private readonly repository: DemoRepository,
    private readonly home: HomeService,
  ) {}

  async load(user: User) {
    await this.repository.insertOnce(user.id);
    return this.home.snapshot(user);
  }
}
