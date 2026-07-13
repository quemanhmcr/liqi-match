import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  isDiscoveryEligible,
  PlayerLifecycleSnapshotV1Schema,
} from '@/shared/contracts/core-v1';

const fixtureRoot = path.join(
  process.cwd(),
  'contracts/core-v1/fixtures/provider',
);
const readLifecycle = (state: string) =>
  PlayerLifecycleSnapshotV1Schema.parse(
    JSON.parse(
      fs.readFileSync(
        path.join(fixtureRoot, `player-lifecycle-${state}.json`),
        'utf8',
      ),
    ),
  );

describe('Mission 1 → Mission 2 lifecycle consumer contract', () => {
  it('recommends only an active and discoverable player', () => {
    const decisions = ['onboarding', 'active', 'suspended', 'deleting'].map(
      (state) => {
        const lifecycle = readLifecycle(state);
        return { eligible: isDiscoveryEligible(lifecycle), state };
      },
    );

    expect(decisions).toEqual([
      { eligible: false, state: 'onboarding' },
      { eligible: true, state: 'active' },
      { eligible: false, state: 'suspended' },
      { eligible: false, state: 'deleting' },
    ]);
  });

  it('does not infer eligibility from profile internals', () => {
    const active = readLifecycle('active');

    expect(Object.keys(active).sort()).toEqual([
      'accountId',
      'discoverable',
      'messagingAllowed',
      'playerId',
      'profileId',
      'profileVersion',
      'state',
      'updatedAt',
      'version',
    ]);
    expect(isDiscoveryEligible({ ...active, discoverable: false })).toBe(false);
  });
});
