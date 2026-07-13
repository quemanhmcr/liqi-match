import { describe, expect, it } from '@jest/globals';

import {
  GOLDEN_PROFILE_IDS,
  GOLDEN_WORLD,
  generateSimulationWorld,
  validateSimulationWorld,
} from '@/entities/simulation';

describe('deterministic simulation generator', () => {
  it('generates the same valid world for the same seed', () => {
    const left = generateSimulationWorld({ profileCount: 50, seed: 'load-v1' });
    const right = generateSimulationWorld({
      profileCount: 50,
      seed: 'load-v1',
    });

    expect(left).toEqual(right);
    expect(Object.keys(left.profiles)).toHaveLength(50);
    expect(validateSimulationWorld(left)).toEqual([]);
  });

  it('preserves golden actors and changes only generated profiles across seeds', () => {
    const alpha = generateSimulationWorld({ profileCount: 50, seed: 'alpha' });
    const beta = generateSimulationWorld({ profileCount: 50, seed: 'beta' });

    expect(alpha.profiles[GOLDEN_PROFILE_IDS.minhAnh]).toEqual(
      GOLDEN_WORLD.profiles[GOLDEN_PROFILE_IDS.minhAnh],
    );
    expect(beta.profiles[GOLDEN_PROFILE_IDS.minhAnh]).toEqual(
      GOLDEN_WORLD.profiles[GOLDEN_PROFILE_IDS.minhAnh],
    );
    expect(Object.keys(alpha.profiles)).not.toEqual(Object.keys(beta.profiles));
  });

  it('never emits profile timestamps beyond the scenario clock', () => {
    const world = generateSimulationWorld({ profileCount: 50, seed: 42 });
    const clock = Date.parse(world.generatedAt);

    for (const profile of Object.values(world.profiles)) {
      expect(Date.parse(profile.createdAt)).toBeLessThanOrEqual(clock);
      expect(Date.parse(profile.updatedAt)).toBeLessThanOrEqual(clock);
      expect(Date.parse(profile.presence.changedAt)).toBeLessThanOrEqual(clock);
    }
  });
});
