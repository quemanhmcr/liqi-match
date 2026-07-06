import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { hasCompletedOnboarding } from '@/features/onboarding/profile-service';
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

describe('hasCompletedOnboarding', () => {
  beforeEach(() => {
    mockSupabaseRest.mockReset();
  });

  it('checks the profile_habits completion marker for the current user', async () => {
    mockSupabaseRest.mockResolvedValueOnce([
      { profile_id: '00000000-0000-0000-0000-000000000001' },
    ]);

    await expect(hasCompletedOnboarding(session)).resolves.toBe(true);

    expect(mockSupabaseRest).toHaveBeenCalledWith(
      'profile_habits?select=profile_id&profile_id=eq.00000000-0000-0000-0000-000000000001&limit=1',
      { session },
    );
  });

  it('returns false when no completion marker exists', async () => {
    mockSupabaseRest.mockResolvedValueOnce([]);

    await expect(hasCompletedOnboarding(session)).resolves.toBe(false);
  });

  it('lets callers decide the safe fallback when the backend check fails', async () => {
    mockSupabaseRest.mockRejectedValueOnce(new Error('permission denied'));

    await expect(hasCompletedOnboarding(session)).rejects.toThrow(
      'permission denied',
    );
  });
});
