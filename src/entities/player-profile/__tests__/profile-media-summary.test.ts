import { describe, expect, it } from '@jest/globals';

import {
  parseProfileWallMediaSlots,
  profileWallMediaIds,
  updateProfileWallMediaSlot,
} from '../profile-media-summary';

describe('profile wall media summary', () => {
  it('normalizes malformed and duplicate slots into a stable four-slot contract', () => {
    expect(
      parseProfileWallMediaSlots({
        wall_media_ids: ['asset-a', 'asset-a', 42, ' asset-b ', 'ignored'],
      }),
    ).toEqual(['asset-a', null, null, 'asset-b']);
  });

  it('preserves unrelated summary fields and legacy completion mirrors', () => {
    expect(
      updateProfileWallMediaSlot({
        assetId: 'asset-c',
        position: 2,
        summary: {
          gender: 'hidden',
          wall_media_ids: ['asset-a', null, null, 'asset-d'],
        },
      }),
    ).toEqual({
      gender: 'hidden',
      wall_count: 3,
      wall_media_ids: ['asset-a', null, 'asset-c', 'asset-d'],
      wall_positions: [0, 2, 3],
    });
  });

  it('removes duplicate placement and exposes only associated asset IDs', () => {
    const next = updateProfileWallMediaSlot({
      assetId: 'asset-a',
      position: 3,
      summary: { wall_media_ids: ['asset-a', 'asset-b', null, null] },
    });
    expect(next.wall_media_ids).toEqual([null, 'asset-b', null, 'asset-a']);
    expect(profileWallMediaIds(next)).toEqual(['asset-b', 'asset-a']);
  });

  it('rejects positions outside the profile limit', () => {
    expect(() =>
      updateProfileWallMediaSlot({
        assetId: 'asset-a',
        position: 4,
        summary: {},
      }),
    ).toThrow('Vị trí ảnh tường không hợp lệ');
  });
});
