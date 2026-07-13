import { describe, expect, it } from '@jest/globals';
import {
  AuthenticatedPrincipalV1Schema,
  CompletePlayerOnboardingResultV1Schema,
  coreV1ConsumerFixtures,
  coreV1ProviderFixtures,
  CoreErrorV1Schema,
  parseCoreV1Fixture,
  PlayerLifecycleSnapshotV1Schema,
} from '@/shared/contracts/core-v1';

describe('Core V1 provider contracts', () => {
  it.each(Object.keys(coreV1ProviderFixtures))(
    'validates provider fixture %s',
    (fixtureName) => {
      expect(
        parseCoreV1Fixture(fixtureName as keyof typeof coreV1ProviderFixtures),
      ).toBeDefined();
    },
  );

  it('keeps semantic identity fields explicit at the provider boundary', () => {
    const parsed = AuthenticatedPrincipalV1Schema.parse(
      coreV1ProviderFixtures['authenticatedPrincipal.valid'].value,
    );

    expect(parsed.accountId).toBeDefined();
    expect(parsed.playerId).toBeDefined();
    expect('userId' in parsed).toBe(false);
  });

  it('publishes the required lifecycle states to consumers', () => {
    const states = [
      'lifecycle.onboarding',
      'lifecycle.active',
      'lifecycle.suspended',
      'lifecycle.deleting',
    ] as const;

    expect(
      states.map(
        (name) =>
          PlayerLifecycleSnapshotV1Schema.parse(
            coreV1ProviderFixtures[name].value,
          ).state,
      ),
    ).toEqual(['onboarding', 'active', 'suspended', 'deleting']);
  });

  it('publishes an optimistic concurrency conflict fixture', () => {
    const error = CoreErrorV1Schema.parse(
      coreV1ProviderFixtures['error.profileVersionConflict'].value,
    );

    expect(error.code).toBe('profile_version_conflict');
    expect(error.retryable).toBe(true);
  });

  it('publishes an idempotent completion replay fixture', () => {
    const result = CompletePlayerOnboardingResultV1Schema.parse(
      coreV1ProviderFixtures['completion.idempotentReplay'].value,
    );

    expect(result.replayed).toBe(true);
    expect(result.lifecycle.state).toBe('active');
  });

  it('declares consumer fixture bundles for all downstream missions', () => {
    expect(Object.keys(coreV1ConsumerFixtures)).toEqual([
      'mission2.discoveryEligibility',
      'mission3.messagingAuthorization',
      'mission4.sessionAndDeepLinks',
    ]);
  });
});
