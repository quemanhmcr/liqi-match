import { describe, expect, it } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AuthenticatedPrincipalV1Schema,
  PlayerLifecycleSnapshotV1Schema,
} from '@/shared/contracts/core-v1';

import { InMemoryMatchIntentRepository } from '../in-memory-match-intent-repository';

const filters = {
  intentKind: 'normal' as const,
  mode: 'normal' as const,
  partyFormat: 'duo' as const,
  roleSlugs: [],
  sessionPlan: 'quick' as const,
  timezone: 'Asia/Bangkok',
};

function session(
  suffix: string,
  state: 'active' | 'onboarding' = 'active',
): AuthSession {
  const accountId = `01000000-0000-4000-8000-${suffix}`;
  const playerId = `21000000-0000-4000-8000-${suffix}`;
  return {
    accessToken: `access:${suffix}`,
    expiresAt: 4_102_444_800,
    lifecycle: PlayerLifecycleSnapshotV1Schema.parse({
      discoverable: state === 'active',
      messagingAllowed: state === 'active',
      playerId,
      profileId: `31000000-0000-4000-8000-${suffix}`,
      state,
      updatedAt: '2026-07-17T00:00:00.000Z',
      version: state === 'active' ? 2 : 1,
    }),
    principal: AuthenticatedPrincipalV1Schema.parse({
      accountId,
      expiresAt: '2100-01-01T00:00:00.000Z',
      issuedAt: '2099-12-31T23:00:00.000Z',
      playerId,
      sessionId: `41000000-0000-4000-8000-${suffix}`,
    }),
    refreshToken: `refresh:${suffix}`,
    tokenType: 'bearer',
    user: { id: accountId },
  };
}

describe('InMemoryMatchIntentRepository', () => {
  it('stores current readiness independently per canonical PlayerId', async () => {
    const repository = new InMemoryMatchIntentRepository();
    const playerA = session('000000000001');
    const playerB = session('000000000002');

    const activated = await repository.activate(playerA, {
      filters,
      idempotencyKey: 'match-intent-activate:player-a',
    });

    await expect(repository.getCurrent(playerA)).resolves.toEqual(
      expect.objectContaining({
        matchIntentId: activated.matchIntentId,
        playerId: activated.playerId,
        state: 'active',
        version: activated.version,
      }),
    );
    await expect(repository.getCurrent(playerB)).resolves.toBeNull();
    expect(activated.playerId).toBe(playerA.principal?.playerId);
  });

  it('fails closed for onboarding lifecycle instead of showing simulated readiness', async () => {
    const repository = new InMemoryMatchIntentRepository();

    await expect(
      repository.activate(session('000000000003', 'onboarding'), {
        filters,
        idempotencyKey: 'match-intent-activate:onboarding',
      }),
    ).rejects.toMatchObject({ code: 'lifecycle_not_active' });
  });
});
