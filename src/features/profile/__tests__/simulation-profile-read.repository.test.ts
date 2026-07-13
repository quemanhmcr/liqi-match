import { describe, expect, it } from '@jest/globals';

import {
  GOLDEN_PROFILE_IDS,
  GOLDEN_WORLD,
  SimulationWorldSnapshotSchema,
} from '@/entities/simulation';

import { mapProfileViewModel } from '../services/simulation-profile-read.repository';

describe('canonical simulation Profile adapter', () => {
  it('uses the same canonical profile ID and media keys as other features', () => {
    const profile = mapProfileViewModel(
      SimulationWorldSnapshotSchema.parse(GOLDEN_WORLD),
      GOLDEN_PROFILE_IDS.minhAnh,
    );

    expect(profile).toMatchObject({
      avatarAssetKey: 'asset:profile:minh-anh:avatar',
      coverAssetKey: 'asset:profile:minh-anh:cover',
      id: GOLDEN_PROFILE_IDS.minhAnh,
    });
  });
});
