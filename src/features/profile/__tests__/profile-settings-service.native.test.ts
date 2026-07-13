import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import { updateProfileSoftSettings } from '../services/profile-settings-service';

jest.mock('@/shared/services/supabase-rest', () => ({
  supabaseRest: jest.fn(),
}));

jest.mock('../services/profile-service', () => ({
  profileMediaUrl: jest.fn(),
}));

const mockSupabaseRest = jest.mocked(supabaseRest);

const session: AuthSession = {
  accessToken: 'access-token',
  expiresAt: 4102444800,
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  user: {
    email: 'profile@example.com',
    id: '00000000-0000-0000-0000-000000000003',
    user_metadata: {},
  },
};

describe('updateProfileSoftSettings', () => {
  beforeEach(() => {
    mockSupabaseRest.mockReset();
  });

  it('does not create profile_habits when the completion row is missing', async () => {
    mockSupabaseRest.mockResolvedValueOnce([]);

    await expect(
      updateProfileSoftSettings(session, { showWinRate: false }),
    ).rejects.toThrow('Không có dữ liệu thói quen nào được tạo');

    expect(mockSupabaseRest).toHaveBeenCalledTimes(1);
    expect(mockSupabaseRest).toHaveBeenCalledWith(
      'profile_habits?select=media_summary&profile_id=eq.00000000-0000-0000-0000-000000000003&limit=1',
      { session },
    );
  });

  it('patches only media_summary settings on an existing row', async () => {
    mockSupabaseRest
      .mockResolvedValueOnce([
        {
          media_summary: {
            cover_media_id: 'cover-1',
            settings: { allow_profile_share: false, show_win_rate: true },
          },
        },
      ])
      .mockResolvedValueOnce(undefined);

    await updateProfileSoftSettings(session, { showWinRate: false });

    expect(mockSupabaseRest).toHaveBeenNthCalledWith(
      2,
      'profile_habits?profile_id=eq.00000000-0000-0000-0000-000000000003',
      {
        body: {
          media_summary: {
            cover_media_id: 'cover-1',
            settings: {
              allow_profile_share: false,
              show_win_rate: false,
            },
          },
        },
        method: 'PATCH',
        prefer: 'return=minimal',
        session,
      },
    );

    const body = mockSupabaseRest.mock.calls[1]?.[1]?.body as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty('seriousness');
    expect(body).not.toHaveProperty('online_time_presets');
    expect(body).not.toHaveProperty('profile_id');
  });
});
