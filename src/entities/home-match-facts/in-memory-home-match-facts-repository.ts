import {
  HomeMatchFactsV1Schema,
  type HomeMatchFactsV1,
} from '@/shared/contracts/core-v1';

import type { HomeMatchFactsRepository } from './home-match-facts-repository';

export class InMemoryHomeMatchFactsRepository implements HomeMatchFactsRepository {
  constructor(
    private readonly facts: HomeMatchFactsV1 = {
      generatedAt: new Date(0).toISOString(),
      items: [],
    },
  ) {}

  async list() {
    return HomeMatchFactsV1Schema.parse(this.facts);
  }
}
