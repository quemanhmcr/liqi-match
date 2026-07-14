import { describe, expect, it } from '@jest/globals';

import type { PlayerLifecycleStateV1 } from '@/shared/contracts/core-v1';

import {
  resolvePlayerAccessMode,
  type PlayerAccessMode,
} from '../access-policy';

const lifecycleCases: [PlayerLifecycleStateV1, PlayerAccessMode][] = [
  ['registered', 'onboarding'],
  ['onboarding', 'onboarding'],
  ['active', 'active'],
  ['suspended', 'suspended'],
  ['deleting', 'deleting'],
  ['deleted', 'deleted'],
];

describe('resolvePlayerAccessMode', () => {
  it.each(lifecycleCases)(
    'maps lifecycle %s to %s',
    (lifecycleState, expected) => {
      expect(
        resolvePlayerAccessMode({ lifecycleState, runtimeMode: 'api' }),
      ).toBe(expected);
    },
  );

  it('fails closed when the API runtime has no lifecycle snapshot', () => {
    expect(
      resolvePlayerAccessMode({ lifecycleState: null, runtimeMode: 'api' }),
    ).toBe('unavailable');
  });

  it('keeps missing lifecycle support explicit for simulation only', () => {
    expect(
      resolvePlayerAccessMode({
        lifecycleState: null,
        runtimeMode: 'simulation',
      }),
    ).toBe('legacy_simulation');
  });
});
