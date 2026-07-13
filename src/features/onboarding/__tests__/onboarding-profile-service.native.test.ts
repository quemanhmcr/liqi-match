import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { completeOnboardingProfile } from '@/features/onboarding';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

jest.mock('@/shared/services/supabase-rest', () => ({
  supabaseRest: jest.fn(),
}));

const mockSupabaseRest = jest.mocked(supabaseRest);

const session: AuthSession = {
  accessToken: 'test-access-token',
  expiresAt: 4102444800,
  refreshToken: 'test-refresh-token',
  tokenType: 'bearer',
  user: {
    email: 'tester@example.com',
    id: '00000000-0000-0000-0000-000000000001',
    user_metadata: { full_name: 'Test Player' },
  },
};

describe('completeOnboardingProfile', () => {
  beforeEach(() => {
    mockSupabaseRest.mockReset();
  });

  it('uses profile basics from onboarding snapshot when completing the profile', async () => {
    mockSupabaseRest.mockResolvedValueOnce([{ completed: true }]);

    await expect(
      completeOnboardingProfile(session, {
        profileBasics: { displayName: 'Liqi Pro', gender: 'hidden' },
        rankId: 'master',
        laneIds: ['jungle'],
        heroIds: ['edras', 'goverra', 'heino'],
        habits: {
          comeback_response: 'Theo quyết định chung của đội',
          communication_channels: ['Voice khi cần'],
          decision_style: 'Cùng trao đổi trước khi quyết định',
          feedback_style: 'Chỉ nhắc ngắn gọn trong trận',
          loss_response: 'Nghỉ 5-15 phút',
          online_time_presets: ['Tối'],
          seriousness: 'Cân bằng',
          session_length: '3-5 trận',
          strategy_styles: ['Ưu tiên kiểm soát mục tiêu'],
          team_atmospheres: ['Nghiêm túc nhưng tôn trọng'],
          team_goals: ['Leo rank nghiêm túc'],
        },
      }),
    ).resolves.toBe(true);

    expect(mockSupabaseRest).toHaveBeenCalledWith(
      'rpc/complete_onboarding',
      expect.objectContaining({
        body: expect.objectContaining({
          payload: expect.objectContaining({
            display_name: 'Liqi Pro',
            handle: 'Liqi Pro',
            profile_basics: { gender: 'hidden' },
          }),
        }),
        method: 'POST',
        session,
      }),
    );

    const request = mockSupabaseRest.mock.calls[0]?.[1] as {
      body: {
        payload: {
          availability_slots: {
            day_of_week: number;
            ends_at: string;
            starts_at: string;
          }[];
        };
      };
    };
    expect(request.body.payload.availability_slots).toHaveLength(7);
    expect(request.body.payload.availability_slots).toEqual(
      expect.arrayContaining([
        { day_of_week: 0, starts_at: '18:00:00', ends_at: '23:59:59' },
        { day_of_week: 6, starts_at: '18:00:00', ends_at: '23:59:59' },
      ]),
    );
  });

  it('fails before calling the backend when the habits step is missing', async () => {
    await expect(
      completeOnboardingProfile(session, {
        profileBasics: { displayName: 'Liqi Pro', gender: 'hidden' },
        rankId: 'master',
        laneIds: ['jungle'],
        heroIds: ['edras', 'goverra', 'heino'],
      }),
    ).rejects.toThrow('Dữ liệu onboarding chưa đầy đủ');

    expect(mockSupabaseRest).not.toHaveBeenCalled();
  });
});
