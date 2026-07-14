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
  PlayerProfileIdentitySnapshotV1Schema,
  PlayerProfileUpdatedEventV1Schema,
  PlayerProfileVersionV1Schema,
  UpdatePlayerProfileIdentityCommandV1Schema,
  UpdatePlayerProfileIdentityResultV1Schema,
  PlayerDeletionRequestedEventV1Schema,
  RequestPlayerDeletionCommandV1Schema,
  RequestPlayerDeletionResultV1Schema,
  SuspendPlayerResultV1Schema,
  SuspendPlayerCommandV1Schema,
  ResumePlayerResultV1Schema,
  ResumePlayerCommandV1Schema,
  PlayerSuspendedEventV1Schema,
  PlayerResumedEventV1Schema,
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

  it('publishes the service-owned suspension command', () => {
    const command = SuspendPlayerCommandV1Schema.parse(
      read('player-suspension-command.json'),
    );

    expect(command.expectedLifecycleVersion).toBe(3);
    expect(command.reasonCode).toBe('trust.safety_review');
  });

  it('publishes an idempotent suspended-state replay receipt', () => {
    const result = SuspendPlayerResultV1Schema.parse(
      read('player-suspension-replay.json'),
    );

    expect(result.repeated).toBe(true);
    expect(result.lifecycle.state).toBe('suspended');
    expect(result.reasonCode).toBe('trust.safety_review');
  });

  it('publishes the suspended lifecycle event', () => {
    const event = PlayerSuspendedEventV1Schema.parse(
      read('player-suspended-event.json'),
    );

    expect(event.aggregateId).toBe(event.data.playerId);
    expect(event.data.lifecycleVersion).toBe(4);
  });

  it('publishes the service-owned resume command', () => {
    const command = ResumePlayerCommandV1Schema.parse(
      read('player-resume-command.json'),
    );

    expect(command.expectedLifecycleVersion).toBe(4);
  });

  it('publishes an idempotent active-state resume receipt', () => {
    const result = ResumePlayerResultV1Schema.parse(
      read('player-resume-replay.json'),
    );

    expect(result.repeated).toBe(true);
    expect(result.lifecycle.state).toBe('active');
  });

  it('publishes the causally linked resumed lifecycle event', () => {
    const event = PlayerResumedEventV1Schema.parse(
      read('player-resumed-event.json'),
    );

    expect(event.aggregateId).toBe(event.data.playerId);
    expect(event.causationId).not.toBeNull();
    expect(event.data.lifecycleVersion).toBe(5);
  });

  it('publishes the authoritative completion command with a legacy transport bridge', () => {
    const command = CompletePlayerOnboardingCommandV1Schema.parse(
      read('onboarding-completion-command.json'),
    );

    expect(command.profile.favoriteHeroSlugs).toHaveLength(3);
    expect(command.legacyProfilePayload).toBeDefined();
  });

  it('publishes an explicit, versioned account-deletion command', () => {
    const command = RequestPlayerDeletionCommandV1Schema.parse(
      read('account-deletion-command.json'),
    );

    expect(command.confirmation).toBe('DELETE');
    expect(command.expectedLifecycleVersion).toBe(3);
  });

  it('publishes an idempotent deleting-state replay receipt', () => {
    const result = RequestPlayerDeletionResultV1Schema.parse(
      read('account-deletion-replay.json'),
    );

    expect(result.repeated).toBe(true);
    expect(result.lifecycle.state).toBe('deleting');
    expect(result.principal.playerId).toBe(result.lifecycle.playerId);
  });

  it('publishes the deletion-requested lifecycle event', () => {
    const event = PlayerDeletionRequestedEventV1Schema.parse(
      read('player-deletion-requested-event.json'),
    );

    expect(event.data.lifecycleVersion).toBe(4);
    expect(event.aggregateId).toBe(event.data.playerId);
  });

  it('publishes the authoritative profile identity read snapshot', () => {
    const snapshot = PlayerProfileIdentitySnapshotV1Schema.parse(
      read('profile-identity-snapshot.json'),
    );

    expect(snapshot.profileVersion).toBe(3);
    expect(snapshot.identity.status).toBe('ready');
  });

  it('publishes the optimistic profile identity command', () => {
    const command = UpdatePlayerProfileIdentityCommandV1Schema.parse(
      read('profile-identity-update-command.json'),
    );

    expect(command.expectedProfileVersion).toBe(2);
    expect(command.identity.displayName).toBe('Liqi Pro');
  });

  it('publishes a durable identity update replay receipt', () => {
    const result = UpdatePlayerProfileIdentityResultV1Schema.parse(
      read('profile-identity-update-replay.json'),
    );

    expect(result.repeated).toBe(true);
    expect(result.profileVersion).toBe(3);
  });

  it('publishes the profile-updated event', () => {
    const event = PlayerProfileUpdatedEventV1Schema.parse(
      read('player-profile-updated-event.json'),
    );

    expect(event.data.profileVersion).toBe(3);
    expect(event.aggregateId).toBe(event.data.playerId);
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
