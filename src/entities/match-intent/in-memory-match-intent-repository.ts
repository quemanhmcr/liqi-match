import {
  ActivateMatchIntentCommandV1Schema,
  PauseMatchIntentCommandV1Schema,
  type MatchIntentSnapshotV1,
} from '@/shared/contracts/core-v1';

import type { MatchIntentRepository } from './match-intent-repository';

export class InMemoryMatchIntentRepository implements MatchIntentRepository {
  private current: MatchIntentSnapshotV1 | null = null;

  async getCurrent() {
    return this.current;
  }

  async activate(_session: unknown, command: unknown) {
    const input = ActivateMatchIntentCommandV1Schema.parse(command);
    const version = (this.current?.version ?? 0) + 1;
    this.current = {
      activatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      filters: input.filters,
      matchIntentId: '10000000-0000-4000-8000-000000000001' as never,
      playerId: '20000000-0000-4000-8000-000000000001' as never,
      state: 'active',
      version,
    };
    return { ...this.current, repeated: false };
  }

  async pause(_session: unknown, command: unknown) {
    const input = PauseMatchIntentCommandV1Schema.parse(command);
    if (!this.current || this.current.version !== input.expectedVersion) {
      throw new Error('Match Intent version conflict.');
    }
    this.current = {
      ...this.current,
      state: 'paused',
      version: this.current.version + 1,
    };
    return { ...this.current, repeated: false };
  }
}
