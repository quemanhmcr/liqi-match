import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { completeOnboardingProfile } from '@/features/onboarding';
import { synchronizeAuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';
import { createTestAuthSession } from '@/test/render-with-providers';

import {
  completeOnboardingDraftData,
  completeProfileDraft,
} from './onboarding-test-fixtures';

jest.mock('@/shared/services/supabase-rest', () => ({
  supabaseRest: jest.fn(),
}));

jest.mock('@/shared/auth/auth-service', () => {
  const actual = jest.requireActual<
    typeof import('@/shared/auth/auth-service')
  >('@/shared/auth/auth-service');
  return { ...actual, synchronizeAuthSession: jest.fn() };
});

const mockSupabaseRest = jest.mocked(supabaseRest);
const mockSynchronizeAuthSession = jest.mocked(synchronizeAuthSession);
const onboardingSession = createTestAuthSession({
  lifecycleState: 'onboarding',
});
const activeSession = createTestAuthSession({ lifecycleState: 'active' });

function completionResult(repeated = false) {
  return {
    lifecycle: activeSession.lifecycle,
    principal: onboardingSession.principal,
    profileVersion: 1,
    repeated,
  };
}

describe('completeOnboardingProfile', () => {
  beforeEach(() => {
    mockSupabaseRest.mockReset();
    mockSynchronizeAuthSession.mockReset().mockResolvedValue(onboardingSession);
  });

  it('sends the authoritative canonical command through the migration adapter', async () => {
    mockSupabaseRest.mockResolvedValueOnce(completionResult());

    await expect(
      completeOnboardingProfile(
        onboardingSession,
        completeOnboardingDraftData(),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        completed: true,
        profileVersion: 1,
        repeated: false,
        session: onboardingSession,
        warnings: expect.any(Array),
      }),
    );

    expect(mockSynchronizeAuthSession).toHaveBeenCalledTimes(1);
    expect(mockSupabaseRest).toHaveBeenCalledWith(
      'rpc/complete_player_onboarding_v1',
      expect.objectContaining({
        body: {
          command: expect.objectContaining({
            expectedProfileVersion: 0,
            idempotencyKey: `onboarding.complete.${onboardingSession.user.id}`,
            legacyProfilePayload: expect.objectContaining({
              display_name: 'Liqi Pro',
              handle: 'LiqiGame#123',
              profile_basics: { gender: 'hidden' },
              rank_slug: 'master',
              role_slugs: ['jungle'],
              timezone: 'Asia/Ho_Chi_Minh',
            }),
            profile: {
              displayName: 'Liqi Pro',
              favoriteHeroSlugs: ['edras', 'goverra', 'heino'],
              gameHandle: 'LiqiGame#123',
              rankSlug: 'master',
              roleSlugs: ['jungle'],
              timezone: 'Asia/Ho_Chi_Minh',
            },
          }),
        },
        method: 'POST',
        session: onboardingSession,
      }),
    );

    const request = mockSupabaseRest.mock.calls[0]?.[1] as {
      body: {
        command: {
          legacyProfilePayload: {
            availability_slots: {
              day_of_week: number;
              ends_at: string;
              starts_at: string;
            }[];
          };
        };
      };
    };
    expect(
      request.body.command.legacyProfilePayload.availability_slots,
    ).toEqual([
      { day_of_week: 0, ends_at: '23:59:59', starts_at: '18:00:00' },
      { day_of_week: 6, ends_at: '23:59:59', starts_at: '18:00:00' },
    ]);
  });

  it('uses the same idempotency key for a retry and accepts repeated receipts', async () => {
    mockSupabaseRest
      .mockResolvedValueOnce(completionResult())
      .mockResolvedValueOnce(completionResult(true));

    const first = await completeOnboardingProfile(
      onboardingSession,
      completeOnboardingDraftData(),
    );
    const retry = await completeOnboardingProfile(
      onboardingSession,
      completeOnboardingDraftData(),
    );

    expect(first.repeated).toBe(false);
    expect(retry.repeated).toBe(true);
    const firstCommand = (mockSupabaseRest.mock.calls[0]?.[1] as any).body
      .command;
    const retryCommand = (mockSupabaseRest.mock.calls[1]?.[1] as any).body
      .command;
    expect(retryCommand.idempotencyKey).toBe(firstCommand.idempotencyKey);
    expect(retryCommand).toEqual(firstCommand);
  });

  it('fails before calling the backend when game handle is unanswered', async () => {
    const profile = completeProfileDraft();
    await expect(
      completeOnboardingProfile(onboardingSession, {
        profile: {
          ...profile,
          profileBasics: { ...profile.profileBasics, gameHandle: null },
        },
      }),
    ).rejects.toThrow('gameHandle');

    expect(mockSynchronizeAuthSession).not.toHaveBeenCalled();
    expect(mockSupabaseRest).not.toHaveBeenCalled();
  });

  it('replays a completed receipt when the app resumes with an active player', async () => {
    mockSynchronizeAuthSession.mockResolvedValueOnce(activeSession);
    mockSupabaseRest.mockResolvedValueOnce(completionResult(true));

    await expect(
      completeOnboardingProfile(activeSession, completeOnboardingDraftData()),
    ).resolves.toEqual(
      expect.objectContaining({
        repeated: true,
        session: activeSession,
      }),
    );
    expect(mockSupabaseRest).toHaveBeenCalledWith(
      'rpc/complete_player_onboarding_v1',
      expect.objectContaining({
        body: {
          command: expect.objectContaining({
            idempotencyKey: `onboarding.complete.${activeSession.user.id}`,
          }),
        },
      }),
    );
  });

  it('rejects a response that does not confirm active capabilities', async () => {
    mockSupabaseRest.mockResolvedValueOnce({
      ...completionResult(),
      lifecycle: onboardingSession.lifecycle,
    });

    await expect(
      completeOnboardingProfile(
        onboardingSession,
        completeOnboardingDraftData(),
      ),
    ).rejects.toMatchObject({ code: 'invalid_lifecycle_transition' });
  });
});
