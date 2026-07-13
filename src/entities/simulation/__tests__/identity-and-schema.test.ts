import { describe, expect, it } from '@jest/globals';

import {
  AssetKeySchema,
  ProfileIdSchema,
  SimulationWorldSnapshotSchema,
  profileId,
} from '@/entities/simulation';

import { GOLDEN_WORLD } from '../golden-world';

describe('canonical simulation identity and schema', () => {
  it('accepts only canonical prefixed identifiers', () => {
    expect(profileId('profile:quang-viewer')).toBe('profile:quang-viewer');
    expect(ProfileIdSchema.safeParse('profile-quang-viewer').success).toBe(
      false,
    );
    expect(ProfileIdSchema.safeParse('conversation:quang-viewer').success).toBe(
      false,
    );
    expect(AssetKeySchema.safeParse('asset:profile:quang:avatar').success).toBe(
      true,
    );
  });

  it('parses the versioned normalized golden world without inventing UI DTOs', () => {
    const parsed = SimulationWorldSnapshotSchema.parse(GOLDEN_WORLD);

    expect(parsed.version).toBe(1);
    expect(parsed.viewerId).toBe('profile:quan-viewer');
    expect(Object.keys(parsed.profiles)).toHaveLength(12);
    expect(Object.keys(parsed.sets)).toHaveLength(3);
    expect(Object.keys(parsed.matches)).toHaveLength(6);
    expect(Object.keys(parsed.conversations)).toHaveLength(8);
    expect(Object.keys(parsed.messages)).toHaveLength(40);
    expect(Object.keys(parsed.notifications)).toHaveLength(10);
  });
});
