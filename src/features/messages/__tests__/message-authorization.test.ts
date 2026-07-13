import { describe, expect, it } from '@jest/globals';

import {
  coreV1ProviderFixtures,
  parseCoreV1Fixture,
  type AuthenticatedPrincipalV1,
  type PlayerLifecycleSnapshotV1,
} from '@/shared/contracts/core-v1';

import {
  authorizeMessagingActor,
  MessagingAuthorizationError,
} from '../model/message-authorization';

const now = '2026-07-14T00:30:00.000Z';

function principal(): AuthenticatedPrincipalV1 {
  return parseCoreV1Fixture(
    'authenticatedPrincipal.valid',
  ) as AuthenticatedPrincipalV1;
}

function lifecycle(
  name: 'lifecycle.active' | 'lifecycle.deleting' | 'lifecycle.suspended',
): PlayerLifecycleSnapshotV1 {
  const value = parseCoreV1Fixture(name) as PlayerLifecycleSnapshotV1;
  return { ...value, playerId: principal().playerId! };
}

function expectFailure(
  run: () => unknown,
  code: MessagingAuthorizationError['code'],
) {
  try {
    run();
    throw new Error('Expected authorization to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(MessagingAuthorizationError);
    expect((error as MessagingAuthorizationError).code).toBe(code);
  }
}

describe('Conversation messaging authorization', () => {
  it('authorizes only a valid principal mapped to an active messaging player', () => {
    const active = lifecycle('lifecycle.active');

    expect(
      authorizeMessagingActor({
        lifecycle: active,
        now,
        principal: principal(),
      }),
    ).toEqual({
      accountId: principal().accountId,
      playerId: active.playerId,
      profileId: active.profileId,
      sessionId: principal().sessionId,
    });
  });

  it('rejects suspended and deleting players from the provider fixture bundle', () => {
    expectFailure(
      () =>
        authorizeMessagingActor({
          lifecycle: lifecycle('lifecycle.suspended'),
          now,
          principal: principal(),
        }),
      'player_suspended',
    );
    expectFailure(
      () =>
        authorizeMessagingActor({
          lifecycle: lifecycle('lifecycle.deleting'),
          now,
          principal: principal(),
        }),
      'player_deleting',
    );
  });

  it('rejects missing or mismatched player mappings without reading profile fields', () => {
    expectFailure(
      () =>
        authorizeMessagingActor({
          lifecycle: null,
          now,
          principal: { ...principal(), playerId: null },
        }),
      'player_not_found',
    );
    expectFailure(
      () =>
        authorizeMessagingActor({
          lifecycle: lifecycle('lifecycle.active'),
          now,
          principal: {
            ...principal(),
            playerId: '10000000-0000-4000-8000-000000000999',
          },
        }),
      'player_not_found',
    );
  });

  it('rejects expired sessions before lifecycle authorization', () => {
    expectFailure(
      () =>
        authorizeMessagingActor({
          lifecycle: lifecycle('lifecycle.active'),
          now,
          principal:
            coreV1ProviderFixtures['authenticatedPrincipal.expired'].value,
        }),
      'session_expired',
    );
  });
});
