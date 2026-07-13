import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';
import {
  ProfileEditCommandError,
  saveProfileHabits,
  saveProfileHeroes,
  saveProfileIdentity,
  saveProfileMediaAssociation,
  saveProfileRoles,
} from '@/features/profile/edit/services/profile-edit-commands';

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
      baseline: { bio: 'Bio', displayName: 'Old name' },
      current: { bio: 'Bio', displayName: 'New name' },
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

  it('upserts a replacement role before deleting the previous role', async () => {
    mockSupabaseRest.mockResolvedValue([]);

    await saveProfileRoles({
      baselineRoleIds: ['role-old'],
      currentRoleIds: ['role-new'],
      profileId,
      session,
    });

    expect(mockSupabaseRest).toHaveBeenCalledTimes(2);
    expect(mockSupabaseRest.mock.calls[0]?.[0]).toBe(
      'profile_roles?on_conflict=profile_id,role_id',
    );
    expect(mockSupabaseRest.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockSupabaseRest.mock.calls[1]?.[0]).toContain(
      'role_id=eq.role-old',
    );
    expect(mockSupabaseRest.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('does not delete an old role when replacement upsert fails', async () => {
    mockSupabaseRest.mockRejectedValueOnce(new Error('insert failed'));

    await expect(
      saveProfileRoles({
        baselineRoleIds: ['role-old'],
        currentRoleIds: ['role-new'],
        profileId,
        session,
      }),
    ).rejects.toMatchObject({ partiallySaved: false });

    expect(mockSupabaseRest).toHaveBeenCalledTimes(1);
    expect(mockSupabaseRest.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('writes replacement hero and ordered metadata before deleting the old hero', async () => {
    const oldHero = '11111111-1111-4111-8111-111111111111';
    const newHero = '22222222-2222-4222-8222-222222222222';
    mockSupabaseRest
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ media_summary: { preserved: true } }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await saveProfileHeroes({
      baselineHeroes: [{ heroId: oldHero, name: 'Old', slug: 'old' }],
      currentHeroes: [{ heroId: newHero, name: 'New', slug: 'new' }],
      hasHabitRecord: true,
      profileId,
      session,
    });

    expect(mockSupabaseRest).toHaveBeenCalledTimes(4);
    expect(mockSupabaseRest.mock.calls[0]?.[0]).toBe(
      'profile_heroes?on_conflict=profile_id,hero_id',
    );
    expect(mockSupabaseRest.mock.calls[1]?.[0]).toContain(
      'profile_habits?select=media_summary',
    );
    expect(mockSupabaseRest.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(mockSupabaseRest.mock.calls[3]?.[0]).toContain(
      `hero_id=eq.${oldHero}`,
    );
    expect(mockSupabaseRest.mock.calls[3]?.[1]).toEqual(
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('keeps the old hero when replacement metadata cannot be saved', async () => {
    const oldHero = '11111111-1111-4111-8111-111111111111';
    const newHero = '22222222-2222-4222-8222-222222222222';
    mockSupabaseRest
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ media_summary: {} }])
      .mockRejectedValueOnce(new Error('summary failed'));

    await expect(
      saveProfileHeroes({
        baselineHeroes: [{ heroId: oldHero, name: 'Old', slug: 'old' }],
        currentHeroes: [{ heroId: newHero, name: 'New', slug: 'new' }],
        hasHabitRecord: true,
        profileId,
        session,
      }),
    ).rejects.toMatchObject({ partiallySaved: true });

    expect(mockSupabaseRest).toHaveBeenCalledTimes(3);
    expect(
      mockSupabaseRest.mock.calls.some(
        ([path, options]) =>
          path.includes(`hero_id=eq.${oldHero}`) &&
          (options as { method?: string })?.method === 'DELETE',
      ),
    ).toBe(false);
  });

  it('patches only the habit answer that changed', async () => {
    mockSupabaseRest.mockResolvedValueOnce([]);

    await saveProfileHabits({
      baseline: { seriousness: 'Cân bằng' },
      current: { seriousness: 'Cạnh tranh' },
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
