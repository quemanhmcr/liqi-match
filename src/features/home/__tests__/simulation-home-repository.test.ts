import { describe, expect, it } from '@jest/globals';

import {
  GOLDEN_PROFILE_IDS,
  GOLDEN_WORLD,
  SimulationWorldSnapshotSchema,
} from '@/entities/simulation';

import { mapHomeDashboard } from '../services/simulation-home-repository';

describe('canonical simulation Home adapter', () => {
  it('keeps profile, conversation and asset identities unchanged', () => {
    const dashboard = mapHomeDashboard(
      SimulationWorldSnapshotSchema.parse(GOLDEN_WORLD),
    );
    const minhAnh = dashboard.matchedSets.find(
      (item) => item.profileId === GOLDEN_PROFILE_IDS.minhAnh,
    );

    expect(dashboard.currentProfile.avatarAssetKey).toBe(
      'asset:profile:quan-viewer:avatar',
    );
    expect(minhAnh).toMatchObject({
      avatarAssetKey: 'asset:profile:minh-anh:avatar',
      conversationId: 'conversation:minh-anh',
      profileId: GOLDEN_PROFILE_IDS.minhAnh,
    });
  });
});
