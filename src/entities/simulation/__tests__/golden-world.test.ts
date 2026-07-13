import { describe, expect, it } from '@jest/globals';

import {
  GOLDEN_ASSET_KEYS,
  GOLDEN_CONVERSATION_IDS,
  GOLDEN_PROFILE_IDS,
  GOLDEN_SET_IDS,
  GOLDEN_WORLD,
  assertSimulationWorldIntegrity,
  notificationId,
  validateSimulationWorld,
} from '@/entities/simulation';

import { SimulationWorldSnapshotSchema } from '../world-schema';

describe('golden simulation world', () => {
  it('keeps intentional actors and cross-feature relationships referentially valid', () => {
    expect(validateSimulationWorld(GOLDEN_WORLD)).toEqual([]);
    expect(assertSimulationWorldIntegrity(GOLDEN_WORLD)).toBe(GOLDEN_WORLD);

    const minhAnhMatch = Object.values(GOLDEN_WORLD.matches).find((match) =>
      match.profileIds.includes(GOLDEN_PROFILE_IDS.minhAnh),
    );
    expect(minhAnhMatch?.conversationId).toBe(GOLDEN_CONVERSATION_IDS.minhAnh);
    expect(GOLDEN_WORLD.sets[GOLDEN_SET_IDS.demViolet]?.memberIds).toContain(
      GOLDEN_PROFILE_IDS.minhAnh,
    );
    expect(
      GOLDEN_WORLD.profiles[GOLDEN_PROFILE_IDS.minhAnh]?.media.avatarAssetKey,
    ).toBe('asset:profile:minh-anh:avatar');
  });

  it('detects orphan notification links, missing assets and duplicate logical actors', () => {
    const broken = SimulationWorldSnapshotSchema.parse(GOLDEN_WORLD);
    const notification =
      broken.notifications[notificationId('notification:khoa-message')];
    const viewer = broken.profiles[GOLDEN_PROFILE_IDS.quanViewer];
    const minhAnh = broken.profiles[GOLDEN_PROFILE_IDS.minhAnh];
    expect(notification?.kind).toBe('direct-message');
    expect(viewer).toBeDefined();
    expect(minhAnh).toBeDefined();
    if (
      !notification ||
      notification.kind !== 'direct-message' ||
      !viewer ||
      !minhAnh
    ) {
      throw new Error('Golden test fixture is incomplete.');
    }

    notification.payload.conversationId =
      'conversation:missing' as typeof notification.payload.conversationId;
    viewer.media.avatarAssetKey =
      'asset:missing' as typeof viewer.media.avatarAssetKey;
    minhAnh.identityKey = viewer.identityKey;

    const codes = validateSimulationWorld(broken).map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'asset_key_missing',
        'duplicate_logical_actor',
        'notification_conversation_missing',
      ]),
    );
  });

  it('models missing and canonical media without phantom manifest references', () => {
    expect(GOLDEN_WORLD.profiles[GOLDEN_PROFILE_IDS.maiSupport]?.media).toEqual(
      {
        avatarAssetKey: null,
        coverAssetKey: null,
        pendingAssociations: [],
        wallAssetKeys: [],
      },
    );
    expect(GOLDEN_WORLD.assets[GOLDEN_ASSET_KEYS.avatarFallback]?.kind).toBe(
      'shared-fallback',
    );
  });
});
