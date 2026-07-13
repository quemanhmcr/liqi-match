import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  AuthenticatedPrincipalV1Schema,
  CompletePlayerOnboardingCommandV1Schema,
  CompletePlayerOnboardingResultV1Schema,
  CoreErrorV1Schema,
  isDiscoveryEligible,
  isMessagingAllowed,
  isPrincipalExpired,
  PlayerIdentityMappingV1Schema,
  PlayerLifecycleSnapshotV1Schema,
  PlayerProfileVersionV1Schema,
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

  it('publishes identity mapping separately from lifecycle semantics', () => {
    const mapping = PlayerIdentityMappingV1Schema.parse(
      read('player-identity-mapping.json'),
    );

    expect(mapping.accountId).not.toBe(mapping.playerId);
    expect(mapping.playerId).not.toBe(mapping.profileId);
  });

  it('publishes optimistic profile version separately from lifecycle', () => {
    const version = PlayerProfileVersionV1Schema.parse(
      read('player-profile-version.json'),
    );

    expect(version.version).toBe(1);
  });

  it.each(['onboarding', 'active', 'suspended', 'deleting', 'deleted'])(
    'validates the %s lifecycle fixture',
    (state) => {
      expect(
        PlayerLifecycleSnapshotV1Schema.parse(
          read(`player-lifecycle-${state}.json`),
        ).state,
      ).toBe(state);
    },
  );

  it('rejects identity and profile-version fields in the exact lifecycle contract', () => {
    expect(() =>
      PlayerLifecycleSnapshotV1Schema.parse({
        ...(read('player-lifecycle-active.json') as object),
        accountId: '01000000-0000-4000-8000-000000000012',
      }),
    ).toThrow();
    expect(() =>
      PlayerLifecycleSnapshotV1Schema.parse({
        ...(read('player-lifecycle-active.json') as object),
        profileVersion: 1,
      }),
    ).toThrow();
  });

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

  it('publishes the authoritative completion command with a legacy transport bridge', () => {
    const command = CompletePlayerOnboardingCommandV1Schema.parse(
      read('onboarding-completion-command.json'),
    );

    expect(command.profile.favoriteHeroSlugs).toHaveLength(3);
    expect(command.legacyProfilePayload).toBeDefined();
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
