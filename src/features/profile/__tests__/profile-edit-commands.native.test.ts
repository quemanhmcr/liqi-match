import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createEmptyHabitAnswers } from '@/entities/player-profile';
import {
  ProfileEditCommandError,
  saveProfileGameProfile,
  saveProfileHabits,
  saveProfileHeroes,
  saveProfileIdentity,
  saveProfileMediaAssociation,
  saveProfileRoles,
} from '@/features/profile/edit/services/profile-edit-commands';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

jest.mock('@/shared/services/supabase-rest', () => ({
  supabaseRest: jest.fn(),
}));

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

beforeEach(() => {
  mockSupabaseRest.mockReset();
});

describe('Profile Edit commands', () => {
  it('saves display name without changing handle, habits, or unrelated identity fields', async () => {
    mockSupabaseRest.mockResolvedValueOnce([]);

    await saveProfileIdentity({
      baseline: {
        bio: 'Bio',
        displayName: 'Old name',
        genderId: null,
      },
      current: {
        bio: 'Bio',
        displayName: 'New name',
        genderId: null,
      },
      profileId,
      session,
    });

    expect(mockSupabaseRest).toHaveBeenCalledTimes(1);
    expect(mockSupabaseRest).toHaveBeenCalledWith(
      `profiles?id=eq.${profileId}`,
      expect.objectContaining({
        body: { display_name: 'New name' },
        method: 'PATCH',
      }),
    );
    expect(mockSupabaseRest.mock.calls[0]?.[0]).not.toContain('game_profiles');
    expect(mockSupabaseRest.mock.calls[0]?.[0]).not.toContain('profile_habits');
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
