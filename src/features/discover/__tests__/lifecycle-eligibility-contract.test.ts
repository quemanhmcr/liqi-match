import { describe, expect, it } from '@jest/globals';

import {
  coreV1ConsumerFixtures,
  coreV1ProviderFixtures,
  PlayerLifecycleSnapshotV1Schema,
} from '@/shared/contracts/core-v1';

import { isDiscoveryEligible } from '../domain/discovery-eligibility';

describe('Mission 1 → Mission 2 lifecycle consumer contract', () => {
  it('recommends only an active and discoverable player', () => {
    const fixtures = coreV1ConsumerFixtures['mission2.discoveryEligibility'];
    const decisions = fixtures.map((fixtureName) => {
      const fixture = coreV1ProviderFixtures[fixtureName];
      const lifecycle = PlayerLifecycleSnapshotV1Schema.parse(fixture.value);

      return {
        eligible: isDiscoveryEligible(lifecycle),
        state: lifecycle.state,
      };
    });

    expect(decisions).toEqual([
      { eligible: false, state: 'onboarding' },
      { eligible: true, state: 'active' },
      { eligible: false, state: 'suspended' },
      { eligible: false, state: 'deleting' },
    ]);
  });

  it('does not infer eligibility from profile internals', () => {
    const active = PlayerLifecycleSnapshotV1Schema.parse(
      coreV1ProviderFixtures['lifecycle.active'].value,
    );

    expect(Object.keys(active).sort()).toEqual([
      'discoverable',
      'messagingAllowed',
      'playerId',
      'profileId',
      'state',
      'updatedAt',
      'version',
    ]);
    expect(isDiscoveryEligible({ ...active, discoverable: false })).toBe(false);
  });
});
