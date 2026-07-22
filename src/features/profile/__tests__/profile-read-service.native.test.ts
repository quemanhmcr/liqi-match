import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import { fetchProfileView } from '../services/profile-service';

jest.mock('@/shared/services/supabase-rest', () => ({
  supabaseRest: jest.fn(),
}));

const mockSupabaseRest = jest.mocked(supabaseRest);

const canonicalPlayerId = '20000000-0000-4000-8000-000000000003';

const session: AuthSession = {
  accessToken: 'access-token',
  expiresAt: 4_102_444_800,
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  user: {
    email: 'profile@example.com',
    id: '01000000-0000-4000-8000-000000000003',
    user_metadata: {},
  },
};

describe('fetchProfileView', () => {
  beforeEach(() => {
    mockSupabaseRest.mockReset();
  });

  it('keeps absent backend fields neutral instead of borrowing preview fixture data', async () => {
    mockSupabaseRest
      .mockResolvedValueOnce({
        contractVersion: 2,
        legacyProfileId: session.user.id,
        playerId: canonicalPlayerId,
        profileId: '30000000-0000-4000-8000-000000000003',
      })
      .mockResolvedValueOnce([
        {
          avatar_media_id: null,
          bio: null,
          display_name: 'Backend Player',
          game_profiles: [
            { handle: 'BackendHandle', ranks: [], server_region: 'global' },
          ],
          id: session.user.id,
          profile_habits: [
            {
              communication_channels: null,
              media_summary: { cover_media_id: 'cover-1' },
              online_time_presets: null,
              seriousness: null,
              team_goals: null,
            },
          ],
          profile_roles: [],
        },
      ])
      .mockResolvedValueOnce([]);

    const profile = await fetchProfileView({ session });

    expect(profile).toEqual(
      expect.objectContaining({
        bio: '',
        displayName: 'Backend Player',
        favoriteHeroes: [],
        gender: 'hidden',
        playStyleTags: [],
        showWinRate: false,
        stats: { matches: 0, rating: 0, reputation: 0, winRate: 0 },
        statusLabel: 'Offline',
        statusValue: 'offline',
        verified: false,
        playerId: canonicalPlayerId,
      }),
    );
    expect(mockSupabaseRest).toHaveBeenCalledTimes(3);
    expect(mockSupabaseRest.mock.calls[0]?.[0]).toBe(
      'rpc/resolve_visible_profile_identity_v2',
    );
    expect(mockSupabaseRest.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        body: { p_target_player_id: null },
        method: 'POST',
      }),
    );
    expect(mockSupabaseRest.mock.calls[1]?.[0]).toContain(
      `profiles?id=eq.${session.user.id}`,
    );
  });

  it('projects canonical availability only when the resolved profile is self', async () => {
    const canonicalProfileId = '30000000-0000-4000-8000-000000000003';
    const selfSession = {
      ...session,
      principal: {
        accountId: session.user.id,
        expiresAt: '2099-12-31T00:00:00.000Z',
        issuedAt: '2026-07-14T12:00:00.000Z',
        playerId: canonicalPlayerId,
        sessionId: '19000000-0000-4000-8000-000000000003',
      },
    } as AuthSession;
    mockSupabaseRest
      .mockResolvedValueOnce({
        contractVersion: 2,
        legacyProfileId: session.user.id,
        playerId: canonicalPlayerId,
        profileId: canonicalProfileId,
      })
      .mockResolvedValueOnce([
        {
          avatar_media_id: null,
          bio: 'Bio',
          display_name: 'Backend Player',
          game_profiles: [],
          id: session.user.id,
          profile_habits: [
            {
              communication_channels: [],
              media_summary: { cover_media_id: 'cover-1' },
              online_time_presets: [],
              seriousness: null,
              team_goals: [],
            },
          ],
          profile_roles: [],
        },
      ])
      .mockResolvedValueOnce({
        availability: {
          slots: [
            { dayOfWeek: 1, endMinute: 1380, startMinute: 1140 },
            { dayOfWeek: 3, endMinute: 1380, startMinute: 1140 },
          ],
          timezone: 'Asia/Ho_Chi_Minh',
        },
        playerId: canonicalPlayerId,
        profileId: canonicalProfileId,
        profileVersion: 4,
      })
      .mockResolvedValueOnce([]);

    const profile = await fetchProfileView({ session: selfSession });

    expect(profile?.availability).toEqual({
      slots: [
        { dayOfWeek: 1, endMinute: 1380, startMinute: 1140 },
        { dayOfWeek: 3, endMinute: 1380, startMinute: 1140 },
      ],
      timezone: 'Asia/Ho_Chi_Minh',
    });
    expect(mockSupabaseRest.mock.calls[2]?.[0]).toBe(
      'rpc/get_own_player_profile_availability_v1',
    );
  });

  it('does not borrow the viewer identity for another incomplete profile', async () => {
    const targetUserId = '01000000-0000-4000-8000-000000000099';
    mockSupabaseRest
      .mockResolvedValueOnce({
        contractVersion: 2,
        legacyProfileId: targetUserId,
        playerId: '20000000-0000-4000-8000-000000000099',
        profileId: '30000000-0000-4000-8000-000000000099',
      })
      .mockResolvedValueOnce([
        {
          avatar_media_id: null,
          bio: null,
          display_name: null,
          game_profiles: [{ handle: null, ranks: [], server_region: null }],
          id: targetUserId,
          playerId: '20000000-0000-4000-8000-000000000099',
          profile_habits: [
            {
              communication_channels: null,
              media_summary: {},
              online_time_presets: null,
              seriousness: null,
              team_goals: null,
            },
          ],
          profile_roles: [],
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const profile = await fetchProfileView({
      session,
      identityId: targetUserId,
    });

    expect(profile).toEqual(
      expect.objectContaining({
        avatarFallbackUrl: undefined,
        displayName: 'Người chơi Liqi',
        id: targetUserId,
      }),
    );
    expect(profile?.displayName).not.toBe('profile');
  });

  it('propagates hero read failures to the repository error state', async () => {
    mockSupabaseRest
      .mockResolvedValueOnce({
        contractVersion: 2,
        legacyProfileId: session.user.id,
        playerId: canonicalPlayerId,
        profileId: '30000000-0000-4000-8000-000000000003',
      })
      .mockResolvedValueOnce([
        {
          avatar_media_id: null,
          bio: null,
          display_name: 'Backend Player',
          game_profiles: [],
          id: session.user.id,
          profile_habits: [],
          profile_roles: [],
        },
      ])
      .mockRejectedValueOnce(new Error('profile heroes unavailable'));

    await expect(fetchProfileView({ session })).rejects.toThrow(
      'profile heroes unavailable',
    );
  });

  it('propagates compatibility cover read failures instead of hiding them', async () => {
    mockSupabaseRest
      .mockResolvedValueOnce({
        contractVersion: 2,
        legacyProfileId: session.user.id,
        playerId: canonicalPlayerId,
        profileId: '30000000-0000-4000-8000-000000000003',
      })
      .mockResolvedValueOnce([
        {
          avatar_media_id: null,
          bio: null,
          display_name: 'Backend Player',
          game_profiles: [],
          id: session.user.id,
          profile_habits: [],
          profile_roles: [],
        },
      ])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('profile cover unavailable'));

    await expect(fetchProfileView({ session })).rejects.toThrow(
      'profile cover unavailable',
    );
  });
});
