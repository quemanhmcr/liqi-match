import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { completeOnboardingProfile } from '@/features/onboarding';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import {
  completeOnboardingDraftData,
  completeProfileDraft,
} from './onboarding-test-fixtures';

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

  it('uses the canonical compatibility adapter without copying display name into handle', async () => {
    mockSupabaseRest.mockResolvedValueOnce([{ completed: true }]);

    await expect(
      completeOnboardingProfile(session, completeOnboardingDraftData()),
    ).resolves.toEqual(
      expect.objectContaining({ completed: true, warnings: expect.any(Array) }),
    );

    expect(mockSupabaseRest).toHaveBeenCalledWith(
      'rpc/complete_onboarding',
      expect.objectContaining({
        body: expect.objectContaining({
          payload: expect.objectContaining({
            display_name: 'Liqi Pro',
            handle: 'LiqiGame#123',
            profile_basics: { gender: 'hidden' },
            rank_slug: 'master',
            role_slugs: ['jungle'],
            timezone: 'Asia/Ho_Chi_Minh',
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
    expect(request.body.payload.availability_slots).toEqual([
      { day_of_week: 0, ends_at: '23:59:59', starts_at: '18:00:00' },
      { day_of_week: 6, ends_at: '23:59:59', starts_at: '18:00:00' },
    ]);
  });

  it('fails before calling the backend when game handle is unanswered', async () => {
    const profile = completeProfileDraft();
    await expect(
      completeOnboardingProfile(session, {
        profile: {
          ...profile,
          profileBasics: { ...profile.profileBasics, gameHandle: null },
        },
      }),
    ).rejects.toThrow('gameHandle');

    expect(mockSupabaseRest).not.toHaveBeenCalled();
  });
});
