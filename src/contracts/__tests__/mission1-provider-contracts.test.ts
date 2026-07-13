import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  AuthenticatedPrincipalV1Schema,
  CompletePlayerOnboardingResultV1Schema,
  CoreErrorV1Schema,
  isDiscoveryEligible,
  isMessagingAllowed,
  isPrincipalExpired,
  PlayerLifecycleSnapshotV1Schema,
} from '../../../contracts/core-v1';

const fixtureRoot = path.join(
  process.cwd(),
  'contracts/core-v1/fixtures/provider',
);
const read = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8')) as unknown;

describe('Mission 1 Core V1 provider contracts', () => {
  it('validates a current authenticated principal', () => {
    const principal = AuthenticatedPrincipalV1Schema.parse(
      read('authenticated-principal-valid.json'),
    );

    expect(
      isPrincipalExpired(principal, new Date('2026-07-14T08:30:00Z')),
    ).toBe(false);
  });

  it('exposes an expired principal fixture without deriving identity elsewhere', () => {
    const principal = AuthenticatedPrincipalV1Schema.parse(
      read('authenticated-principal-expired.json'),
    );

    expect(
      isPrincipalExpired(principal, new Date('2026-07-14T08:30:00Z')),
    ).toBe(true);
    expect(principal.accountId).not.toBe(principal.playerId);
  });

  it.each(['onboarding', 'active', 'suspended', 'deleting'])(
    'validates the %s lifecycle fixture',
    (state) => {
      expect(
        PlayerLifecycleSnapshotV1Schema.parse(
          read(`player-lifecycle-${state}.json`),
        ).state,
      ).toBe(state);
    },
  );

  it('makes discovery and messaging capability authoritative', () => {
    const active = PlayerLifecycleSnapshotV1Schema.parse(
      read('player-lifecycle-active.json'),
    );
    const suspended = PlayerLifecycleSnapshotV1Schema.parse(
      read('player-lifecycle-suspended.json'),
    );

    expect(isDiscoveryEligible(active)).toBe(true);
    expect(isMessagingAllowed(active)).toBe(true);
    expect(isDiscoveryEligible(suspended)).toBe(false);
    expect(isMessagingAllowed(suspended)).toBe(false);
  });

  it('rejects capabilities that contradict lifecycle state', () => {
    expect(() =>
      PlayerLifecycleSnapshotV1Schema.parse({
        ...(read('player-lifecycle-suspended.json') as object),
        discoverable: true,
        messagingAllowed: true,
      }),
    ).toThrow();
  });

  it('publishes the optimistic profile version conflict', () => {
    const error = CoreErrorV1Schema.parse(
      read('profile-version-conflict.json'),
    );

    expect(error.code).toBe('profile_version_conflict');
    expect(error.retryable).toBe(true);
  });

  it('publishes the idempotent completion replay receipt', () => {
    const result = CompletePlayerOnboardingResultV1Schema.parse(
      read('onboarding-completion-replay.json'),
    );

    expect(result.repeated).toBe(true);
    expect(result.lifecycle.state).toBe('active');
  });
});
