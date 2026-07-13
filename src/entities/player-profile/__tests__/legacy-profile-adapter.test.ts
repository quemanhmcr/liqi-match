import { describe, expect, it } from '@jest/globals';

import {
  LegacyOnboardingRpcPayloadSchema,
  adaptCompletedProfileToLegacyOnboardingPayload,
} from '../legacy-profile-adapter';
import { completedProfileFixture } from './profile-contract.fixture';

describe('legacy profile compatibility adapter', () => {
  it('maps canonical IDs without deriving meaning from Vietnamese labels', () => {
    const profile = completedProfileFixture();
    const result = adaptCompletedProfileToLegacyOnboardingPayload(profile);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a legacy payload.');

    expect(result.payload).toMatchObject({
      display_name: 'Liqi Pro',
      handle: 'LiqiPro#001',
      rank_slug: 'grandmaster_iv',
      role_slugs: ['jungle', 'support'],
      habits: {
        communication_channels: ['Voice khi cần', 'Ping/chat là chính'],
        seriousness: 'Cân bằng',
        team_goals: ['Leo rank nghiêm túc', 'Tìm người phối hợp ổn định'],
      },
      heroes: [
        { name: 'Aya', role_slug: 'support', slug: 'aya' },
        { name: 'Nakroth', role_slug: 'assassin', slug: 'nakroth' },
        { name: 'Violet', role_slug: 'marksman', slug: 'violet' },
      ],
    });
    expect(result.payload.handle).not.toBe(result.payload.display_name);
  });

  it('returns explicit warnings for fields the current backend cannot round-trip', () => {
    const result = adaptCompletedProfileToLegacyOnboardingPayload(
      completedProfileFixture(),
    );

    expect(result.ok).toBe(true);
    const codes = result.warnings.map((warning) => warning.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'lane_priority_not_persisted',
        'favorite_hero_priority_not_persisted',
        'match_intent_not_persisted',
        'media_slot_association_not_persisted',
        'wall_media_position_not_persisted',
        'availability_midnight_clamped',
      ]),
    );
  });

  it('refuses to invent a third hero for the current RPC', () => {
    const profile = completedProfileFixture({
      favoriteHeroes: [
        { heroId: 'aya', priority: 1 },
        { heroId: 'nakroth', priority: 2 },
      ],
    });
    const result = adaptCompletedProfileToLegacyOnboardingPayload(profile);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected an adapter error.');
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'legacy_requires_three_heroes' }),
      ]),
    );
  });

  it('requires a separate game handle instead of copying display name', () => {
    const profile = {
      ...completedProfileFixture(),
      profileBasics: {
        displayName: 'Liqi Pro',
        gameHandle: null,
        genderId: 'hidden',
      },
    };
    const result = adaptCompletedProfileToLegacyOnboardingPayload(profile);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected an adapter error.');
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'explicit_game_handle_required' }),
      ]),
    );
  });

  it('rejects unknown legacy rank, lane, and habit values at the RPC boundary', () => {
    const result = adaptCompletedProfileToLegacyOnboardingPayload(
      completedProfileFixture(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a legacy payload.');

    expect(
      LegacyOnboardingRpcPayloadSchema.safeParse({
        ...result.payload,
        habits: {
          ...result.payload.habits,
          seriousness: 'Unknown seriousness',
        },
        rank_slug: 'unknown_rank',
        role_slugs: ['unknown_lane'],
      }).success,
    ).toBe(false);
  });

  it('rejects unknown hero IDs instead of assigning the mage class', () => {
    const profile = {
      ...completedProfileFixture(),
      favoriteHeroes: [
        { heroId: 'unknown', priority: 1 },
        { heroId: 'nakroth', priority: 2 },
        { heroId: 'violet', priority: 3 },
      ],
    };
    const result = adaptCompletedProfileToLegacyOnboardingPayload(profile);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected an adapter error.');
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_canonical_profile' }),
      ]),
    );
  });
});
