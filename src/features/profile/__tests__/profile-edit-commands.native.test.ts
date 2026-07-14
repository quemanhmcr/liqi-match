import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createEmptyHabitAnswers } from '@/entities/player-profile';
import {
  ProfileEditCommandError,
  saveProfileAvailability,
  saveProfileGameProfile,
  saveProfileHabits,
  saveProfileHeroes,
  saveProfileIdentity,
  saveProfileMediaAssociation,
  saveProfileRoles,
} from '@/features/profile/edit/services/profile-edit-commands';
import type { AuthSession } from '@/shared/auth/auth-service';
import { PlayerIdSchema, ProfileIdSchema } from '@/shared/contracts/core-v1';
import {
  SupabaseRestError,
  supabaseRest,
} from '@/shared/services/supabase-rest';

jest.mock('@/shared/services/supabase-rest', () => {
  const actual = jest.requireActual<
    typeof import('@/shared/services/supabase-rest')
  >('@/shared/services/supabase-rest');
  return { ...actual, supabaseRest: jest.fn() };
});

jest.mock('@/shared/services/media-upload', () => ({
  uploadProfileMediaAsset: jest.fn(),
}));

const mockSupabaseRest = jest.mocked(supabaseRest);
const session: AuthSession = {
  accessToken: 'access',
  expiresAt: 4102444800,
  refreshToken: 'refresh',
  tokenType: 'bearer',
  user: {
    email: 'profile@example.com',
    id: '00000000-0000-0000-0000-000000000001',
    user_metadata: {},
  },
};
const profileId = session.user.id;
const canonicalProfileId = ProfileIdSchema.parse(
  '30000000-0000-4000-8000-000000000001',
);
const playerId = PlayerIdSchema.parse('20000000-0000-4000-8000-000000000001');

beforeEach(() => {
  mockSupabaseRest.mockReset();
});

describe('Profile Edit commands', () => {
  it('updates the full identity section through one versioned RPC', async () => {
    mockSupabaseRest.mockResolvedValueOnce({
      identity: {
        bio: 'Bio',
        displayName: 'New name',
        genderId: null,
        stats: { matches: 0, rating: 0, reputation: 0, winRate: 0 },
        status: null,
      },
      playerId,
      profileId: canonicalProfileId,
      profileVersion: 3,
      repeated: false,
    });

    await expect(
      saveProfileIdentity({
        baseline: {
          bio: 'Bio',
          displayName: 'Old name',
          genderId: null,
          stats: { matches: 0, rating: 0, reputation: 0, winRate: 0 },
          status: null,
        },
        canonicalProfileId,
        current: {
          bio: 'Bio',
          displayName: 'New name',
          genderId: null,
          stats: { matches: 0, rating: 0, reputation: 0, winRate: 0 },
          status: null,
        },
        expectedProfileVersion: 2,
        playerId,
        session,
      }),
    ).resolves.toEqual({ profileVersion: 3 });

    expect(mockSupabaseRest).toHaveBeenCalledTimes(1);
    expect(mockSupabaseRest).toHaveBeenCalledWith(
      'rpc/update_player_profile_identity_v1',
      {
        body: {
          command: {
            expectedProfileVersion: 2,
            idempotencyKey: `profile.identity.${session.user.id}.v2`,
            identity: {
              bio: 'Bio',
              displayName: 'New name',
              genderId: null,
              stats: {
                matches: 0,
                rating: 0,
                reputation: 0,
                winRate: 0,
              },
              status: null,
            },
          },
        },
        method: 'POST',
        session,
      },
    );
  });

  it('classifies profile version conflicts as non-retryable', async () => {
    mockSupabaseRest.mockRejectedValueOnce(
      new SupabaseRestError(
        'Player profile changed on another request.',
        409,
        'profile_version_conflict',
        'request-profile-conflict-0001',
        false,
        { actualVersion: 3, expectedVersion: 2 },
        'P0001',
      ),
    );

    await expect(
      saveProfileIdentity({
        baseline: {
          bio: 'Bio',
          displayName: 'Old name',
          genderId: null,
        },
        canonicalProfileId,
        current: {
          bio: 'Bio',
          displayName: 'New name',
          genderId: null,
        },
        expectedProfileVersion: 2,
        playerId,
        session,
      }),
    ).rejects.toMatchObject({
      code: 'profile_version_conflict',
      retryable: false,
    } satisfies Partial<ProfileEditCommandError>);
  });

  it('normalizes and updates Availability through one versioned RPC', async () => {
    mockSupabaseRest.mockResolvedValueOnce({
      availability: {
        slots: [
          { dayOfWeek: 1, startMinute: 1320, endMinute: 1440 },
          { dayOfWeek: 2, startMinute: 0, endMinute: 180 },
        ],
        timezone: 'Asia/Bangkok',
      },
      playerId,
      profileId: canonicalProfileId,
      profileVersion: 3,
      repeated: false,
    });

    await expect(
      saveProfileAvailability({
        canonicalProfileId,
        current: {
          slots: [{ dayOfWeek: 1, startMinute: 1320, endMinute: 180 }],
          timezone: 'Asia/Bangkok',
        },
        expectedProfileVersion: 2,
        playerId,
        session,
      }),
    ).resolves.toEqual({ profileVersion: 3 });

    expect(mockSupabaseRest).toHaveBeenCalledWith(
      'rpc/update_player_profile_availability_v1',
      {
        body: {
          command: {
            availability: {
              slots: [
                { dayOfWeek: 1, startMinute: 1320, endMinute: 1440 },
                { dayOfWeek: 2, startMinute: 0, endMinute: 180 },
              ],
              timezone: 'Asia/Bangkok',
            },
            expectedProfileVersion: 2,
            idempotencyKey: `profile.availability.${session.user.id}.v2`,
          },
        },
        method: 'POST',
        session,
      },
    );
  });

  it('classifies Availability profile version conflicts as non-retryable', async () => {
    mockSupabaseRest.mockRejectedValueOnce(
      new SupabaseRestError(
        'Player profile changed on another request.',
        409,
        'profile_version_conflict',
        'request-availability-conflict-0001',
        false,
        { actualVersion: 4, expectedVersion: 2 },
        'P0001',
      ),
    );

    await expect(
      saveProfileAvailability({
        canonicalProfileId,
        current: null,
        expectedProfileVersion: 2,
        playerId,
        session,
      }),
    ).rejects.toMatchObject({
      code: 'profile_version_conflict',
      retryable: false,
    } satisfies Partial<ProfileEditCommandError>);
  });

  it('maps canonical rank to DB UUID instead of writing the canonical ID', async () => {
    mockSupabaseRest.mockResolvedValueOnce([]);

    await saveProfileGameProfile({
      baseline: { handle: 'Handle', rankId: null },
      current: { handle: 'Handle', rankId: 'master' },
      hasGameProfileRecord: true,
      profileId,
      rankDbIds: { master: 'rank-db-master' },
      session,
    });

    expect(mockSupabaseRest).toHaveBeenCalledWith(
      `game_profiles?profile_id=eq.${profileId}`,
      expect.objectContaining({
        body: { rank_id: 'rank-db-master' },
        method: 'PATCH',
      }),
    );
  });

  it('upserts a replacement lane DB row before deleting the previous row', async () => {
    mockSupabaseRest.mockResolvedValue([]);

    await saveProfileRoles({
      baselineSelection: { primary: 'jungle', secondary: null },
      currentSelection: { primary: 'mid', secondary: null },
      laneDbIds: {
        jungle: 'role-db-jungle',
        mid: 'role-db-mid',
      },
      lanesLossless: true,
      profileId,
      session,
    });

    expect(mockSupabaseRest).toHaveBeenCalledTimes(2);
    expect(mockSupabaseRest.mock.calls[0]?.[0]).toBe(
      'profile_roles?on_conflict=profile_id,role_id',
    );
    expect(mockSupabaseRest.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        body: { profile_id: profileId, role_id: 'role-db-mid' },
        method: 'POST',
      }),
    );
    expect(mockSupabaseRest.mock.calls[1]?.[0]).toContain(
      'role_id=eq.role-db-jungle',
    );
  });

  it('does not delete an old lane when replacement upsert fails', async () => {
    mockSupabaseRest.mockRejectedValueOnce(new Error('insert failed'));

    await expect(
      saveProfileRoles({
        baselineSelection: { primary: 'jungle', secondary: null },
        currentSelection: { primary: 'mid', secondary: null },
        laneDbIds: {
          jungle: 'role-db-jungle',
          mid: 'role-db-mid',
        },
        lanesLossless: true,
        profileId,
        session,
      }),
    ).rejects.toMatchObject({ partiallySaved: false });

    expect(mockSupabaseRest).toHaveBeenCalledTimes(1);
    expect(mockSupabaseRest.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('writes replacement hero and exact ordered metadata before deleting the old hero', async () => {
    mockSupabaseRest
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ media_summary: { preserved: true } }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await saveProfileHeroes({
      baselineHeroes: [{ heroId: 'edras', priority: 1 }],
      currentHeroes: [{ heroId: 'goverra', priority: 1 }],
      hasHabitRecord: true,
      heroDbIds: {
        edras: 'hero-db-edras',
        goverra: 'hero-db-goverra',
      },
      heroesLossless: true,
      profileId,
      session,
    });

    expect(mockSupabaseRest).toHaveBeenCalledTimes(4);
    expect(mockSupabaseRest.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        body: { hero_id: 'hero-db-goverra', profile_id: profileId },
        method: 'POST',
      }),
    );
    expect(mockSupabaseRest.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          media_summary: expect.objectContaining({
            favorite_hero_stats: [
              expect.objectContaining({
                hero_id: 'hero-db-goverra',
                order: 0,
                slug: 'goverra',
              }),
            ],
          }),
        }),
        method: 'PATCH',
      }),
    );
    expect(mockSupabaseRest.mock.calls[3]?.[0]).toContain(
      'hero_id=eq.hero-db-edras',
    );
  });

  it('keeps the old hero when replacement metadata cannot be saved', async () => {
    mockSupabaseRest
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ media_summary: {} }])
      .mockRejectedValueOnce(new Error('summary failed'));

    await expect(
      saveProfileHeroes({
        baselineHeroes: [{ heroId: 'edras', priority: 1 }],
        currentHeroes: [{ heroId: 'goverra', priority: 1 }],
        hasHabitRecord: true,
        heroDbIds: {
          edras: 'hero-db-edras',
          goverra: 'hero-db-goverra',
        },
        heroesLossless: true,
        profileId,
        session,
      }),
    ).rejects.toMatchObject({ partiallySaved: true });

    expect(
      mockSupabaseRest.mock.calls.some(
        ([path, options]) =>
          path.includes('hero_id=eq.hero-db-edras') &&
          (options as { method?: string })?.method === 'DELETE',
      ),
    ).toBe(false);
  });

  it('patches only the changed canonical habit using its exact legacy value', async () => {
    mockSupabaseRest.mockResolvedValueOnce([]);
    const baseline = {
      ...createEmptyHabitAnswers(),
      seriousnessId: 'seriousness.balanced' as const,
    };
    const current = {
      ...baseline,
      seriousnessId: 'seriousness.competitive' as const,
    };

    await saveProfileHabits({
      baseline,
      current,
      habitsLossless: true,
      hasHabitRecord: true,
      profileId,
      session,
    });

    expect(mockSupabaseRest).toHaveBeenCalledWith(
      `profile_habits?profile_id=eq.${profileId}`,
      expect.objectContaining({
        body: { seriousness: 'Cạnh tranh' },
        method: 'PATCH',
      }),
    );
  });

  it('blocks habit writes when legacy adaptation was lossy', async () => {
    await expect(
      saveProfileHabits({
        baseline: createEmptyHabitAnswers(),
        current: {
          ...createEmptyHabitAnswers(),
          seriousnessId: 'seriousness.competitive',
        },
        habitsLossless: false,
        hasHabitRecord: true,
        profileId,
        session,
      }),
    ).rejects.toThrow('chưa resolve losslessly');

    expect(mockSupabaseRest).not.toHaveBeenCalled();
  });

  it('reports avatar as saved when cover association fails afterwards', async () => {
    mockSupabaseRest
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ media_summary: {} }])
      .mockRejectedValueOnce(new Error('cover failed'));

    let failure: unknown;
    try {
      await saveProfileMediaAssociation({
        baseline: {
          avatarMediaId: 'avatar-old',
          coverMediaId: 'cover-old',
          staged: {},
        },
        current: {
          avatarMediaId: 'avatar-new',
          coverMediaId: 'cover-new',
          staged: {},
        },
        hasHabitRecord: true,
        profileId,
        session,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ProfileEditCommandError);
    expect(failure).toMatchObject({
      associatedMediaSlots: ['avatar'],
      partiallySaved: true,
    });
  });
});
