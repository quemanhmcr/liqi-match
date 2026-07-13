import { describe, expect, it } from '@jest/globals';

import {
  GOLDEN_PROFILE_IDS,
  GOLDEN_SET_IDS,
  GOLDEN_WORLD,
  projectSimulationDiscover,
  projectSimulationHome,
  projectSimulationProfile,
} from '@/entities/simulation';

describe('pure simulation projections', () => {
  it('projects one canonical actor consistently across Profile and Home', () => {
    const profile = projectSimulationProfile(
      GOLDEN_WORLD,
      GOLDEN_PROFILE_IDS.minhAnh,
    );
    const home = projectSimulationHome(GOLDEN_WORLD);
    const connection = home.connections.find(
      (item) => item.profileId === GOLDEN_PROFILE_IDS.minhAnh,
    );

    expect(connection).toBeDefined();
    expect(connection?.name).toBe(profile.displayName);
    expect(connection?.avatar?.assetKey).toBe(profile.avatar?.assetKey);
    expect(connection?.rankName).toBe(profile.rank.label);
    expect(connection?.roleNames).toEqual(
      profile.roles.map((role) => role.label),
    );
  });

  it('derives unread state from the same conversation timeline', () => {
    const home = projectSimulationHome(GOLDEN_WORLD);
    const khoa = home.connections.find(
      (item) => item.profileId === GOLDEN_PROFILE_IDS.khoaJungle,
    );

    expect(khoa?.unreadCount).toBe(1);
    expect(khoa?.conversationId).toBe('conversation:khoa-jungle');
  });

  it('projects Discover without resolving fixture assets or mutating the world', () => {
    const before = structuredClone(GOLDEN_WORLD);
    const discover = projectSimulationDiscover(GOLDEN_WORLD);
    const mai = discover.players.find(
      (player) => player.profileId === GOLDEN_PROFILE_IDS.maiSupport,
    );
    const saoBang = discover.sets.find(
      (set) => set.id === GOLDEN_SET_IDS.saoBang,
    );

    expect(mai?.avatar.kind).toBe('fixture');
    expect(mai?.avatar.assetKey).toBe('asset:shared:avatar-fallback');
    expect(saoBang?.members.preview[0]?.id).toBe(GOLDEN_PROFILE_IDS.huyCaptain);
    expect(saoBang?.artwork.assetKey).toBe('asset:set:sao-bang:artwork');
    expect(GOLDEN_WORLD).toEqual(before);
  });
});
