import {
  ActivateMatchIntentCommandV1Schema,
  PauseMatchIntentCommandV1Schema,
  type MatchIntentSnapshotV1,
  type PlayerId,
} from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';

import { resolveActiveMatchIntentActor } from './match-intent-actor';
import type { MatchIntentRepository } from './match-intent-repository';

export class InMemoryMatchIntentRepository implements MatchIntentRepository {
  private readonly currentByPlayerId = new Map<
    PlayerId,
    MatchIntentSnapshotV1
  >();

  async getCurrent(session: AuthSession) {
    const actor = resolveActiveMatchIntentActor(session);
    return this.currentByPlayerId.get(actor.playerId) ?? null;
  }

  async activate(session: AuthSession, command: unknown) {
    const actor = resolveActiveMatchIntentActor(session);
    const input = ActivateMatchIntentCommandV1Schema.parse(command);
    const current = this.currentByPlayerId.get(actor.playerId);
    if (
      input.expectedVersion !== undefined &&
      current &&
      current.version !== input.expectedVersion
    ) {
      throw matchIntentVersionConflict();
    }
    const version = (current?.version ?? 0) + 1;
    const next: MatchIntentSnapshotV1 = {
      activatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      filters: input.filters,
      matchIntentId: deterministicIntentId(actor.playerId),
      playerId: actor.playerId,
      state: 'active',
      version,
    };
    this.currentByPlayerId.set(actor.playerId, next);
    return { ...next, repeated: false };
  }

  async pause(session: AuthSession, command: unknown) {
    const actor = resolveActiveMatchIntentActor(session);
    const input = PauseMatchIntentCommandV1Schema.parse(command);
    const current = this.currentByPlayerId.get(actor.playerId);
    if (!current || current.version !== input.expectedVersion) {
      throw matchIntentVersionConflict();
    }
    const next: MatchIntentSnapshotV1 = {
      ...current,
      activatedAt: null,
      expiresAt: null,
      state: 'paused',
      version: current.version + 1,
    };
    this.currentByPlayerId.set(actor.playerId, next);
    return { ...next, repeated: false };
  }
}

function deterministicIntentId(playerId: PlayerId) {
  return `10000000-0000-4000-8000-${playerId.slice(-12)}` as MatchIntentSnapshotV1['matchIntentId'];
}

function matchIntentVersionConflict() {
  return Object.assign(new Error('Match Intent version conflict.'), {
    code: 'intent_version_conflict',
    retryable: false,
  });
}
