import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import { fetchProfileView } from '../services/profile-service';

jest.mock('@/shared/services/supabase-rest', () => ({
  supabaseRest: jest.fn(),
}));

const mockSupabaseRest = jest.mocked(supabaseRest);

const session: AuthSession = {
  accessToken: 'access-token',
  expiresAt: 4_102_444_800,
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  user: {
    email: 'profile@example.com',
    id: '00000000-0000-0000-0000-000000000003',
    user_metadata: {},
  },
};

describe('fetchProfileView', () => {
  beforeEach(() => {
    mockSupabaseRest.mockReset();
  });

  it('keeps absent backend fields neutral instead of borrowing preview fixture data', async () => {
    mockSupabaseRest
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
        playStyleTags: [],
        stats: { matches: 0, rating: 0, reputation: 0, winRate: 0 },
      }),
    );
    expect(mockSupabaseRest).toHaveBeenCalledTimes(2);
  });
});
