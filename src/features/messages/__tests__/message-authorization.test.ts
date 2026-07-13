import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  AuthenticatedPrincipalV1Schema,
  PlayerLifecycleSnapshotV1Schema,
  type AuthenticatedPrincipalV1,
  type PlayerLifecycleSnapshotV1,
} from '../../../../contracts/core-v1';

import {
  authorizeMessagingActor,
  MessagingAuthorizationError,
} from '../model/message-authorization';

const fixtureRoot = path.join(
  process.cwd(),
  'contracts/core-v1/fixtures/provider',
);
const now = '2026-07-14T08:30:00.000Z';

function read(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8'));
}

function principal(
  name:
    | 'authenticated-principal-expired.json'
    | 'authenticated-principal-valid.json' = 'authenticated-principal-valid.json',
): AuthenticatedPrincipalV1 {
  return AuthenticatedPrincipalV1Schema.parse(read(name));
}

function lifecycle(
  state: 'active' | 'deleting' | 'suspended',
): PlayerLifecycleSnapshotV1 {
  const value = PlayerLifecycleSnapshotV1Schema.parse(
    read(`player-lifecycle-${state}.json`),
  );
  const actor = principal();
  return {
    ...value,
    accountId: actor.accountId,
    playerId: actor.playerId!,
  };
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
  it('authorizes only a current principal mapped to an active messaging player', () => {
    const active = lifecycle('active');
    const actor = principal();

    expect(
      authorizeMessagingActor({ lifecycle: active, now, principal: actor }),
    ).toEqual({
      accountId: actor.accountId,
      playerId: active.playerId,
      profileId: active.profileId,
      sessionId: actor.sessionId,
    });
  });

  it('rejects suspended and deleting provider lifecycle fixtures', () => {
    expectFailure(
      () =>
        authorizeMessagingActor({
          lifecycle: lifecycle('suspended'),
          now,
          principal: principal(),
        }),
      'player_suspended',
    );
    expectFailure(
      () =>
        authorizeMessagingActor({
          lifecycle: lifecycle('deleting'),
          now,
          principal: principal(),
        }),
      'player_deleting',
    );
  });

  it('rejects missing or mismatched authoritative mappings', () => {
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
          lifecycle: lifecycle('active'),
          now,
          principal: AuthenticatedPrincipalV1Schema.parse({
            ...(read('authenticated-principal-valid.json') as object),
            accountId: '01000000-0000-4000-8000-000000000099',
          }),
        }),
      'player_not_found',
    );
  });

  it('rejects expired sessions before lifecycle authorization', () => {
    expectFailure(
      () =>
        authorizeMessagingActor({
          lifecycle: lifecycle('active'),
          now,
          principal: principal('authenticated-principal-expired.json'),
        }),
      'session_expired',
    );
  });
});
