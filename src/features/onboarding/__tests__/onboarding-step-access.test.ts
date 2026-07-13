import { describe, expect, it } from '@jest/globals';

import {
  createEmptyOnboardingDraft,
  ONBOARDING_DRAFT_VERSION,
  type OnboardingDraftData,
  type OnboardingDraftEnvelope,
  type OnboardingStatus,
} from '../model/persisted-onboarding-draft';
import {
  onboardingStepFromPathname,
  resolveOnboardingStepAccess,
} from '../model/onboarding-step-access';

const accountId = '00000000-0000-0000-0000-000000000001';

describe('resolveOnboardingStepAccess', () => {
  it('starts a new user at profile setup without synthetic answers', () => {
    const draft = createEmptyOnboardingDraft(accountId);
    const result = resolveOnboardingStepAccess({
      envelope: draft,
      hasPersistedDraft: false,
      legacyCoreProfileCompleted: false,
      requestedStep: 'profile_setup',
    });

    expect(draft.data).toEqual({});
    expect(result.currentStep).toBe('profile_setup');
    expect(result.canLeaveOnboarding).toBe(false);
  });

  it('resumes at the first unanswered step', () => {
    const result = resolveOnboardingStepAccess({
      envelope: envelope({
        data: { profileBasics: { gender: 'hidden' } },
      }),
      hasPersistedDraft: true,
      legacyCoreProfileCompleted: false,
      requestedStep: 'rank',
    });

    expect(result.currentStep).toBe('rank');
    expect(result.canAccessRequestedStep).toBe(true);
  });

  it('blocks a deep link that skips prerequisites', () => {
    const result = resolveOnboardingStepAccess({
      envelope: envelope({
        data: { profileBasics: { gender: 'hidden' } },
      }),
      hasPersistedDraft: true,
      legacyCoreProfileCompleted: false,
      requestedStep: 'profile_media',
    });

    expect(result.canAccessRequestedStep).toBe(false);
    expect(result.redirectTarget).toBe('rank');
  });

  it('allows media only after all core answers exist', () => {
    const result = resolveOnboardingStepAccess({
      envelope: envelope({ data: completeData() }),
      hasPersistedDraft: true,
      legacyCoreProfileCompleted: false,
      requestedStep: 'profile_media',
    });

    expect(result.canAccessMedia).toBe(true);
    expect(result.redirectTarget).toBeNull();
  });

  it('locks media_pending users to the media step', () => {
    const result = resolveOnboardingStepAccess({
      envelope: envelope({ status: 'media_pending' }),
      hasPersistedDraft: true,
      legacyCoreProfileCompleted: true,
      requestedStep: 'habits',
    });

    expect(result.canLeaveOnboarding).toBe(false);
    expect(result.currentStep).toBe('profile_media');
    expect(result.redirectTarget).toBe('profile_media');
  });

  it('lets only the completed workflow leave onboarding', () => {
    const result = resolveOnboardingStepAccess({
      envelope: envelope({ status: 'completed' }),
      hasPersistedDraft: true,
      legacyCoreProfileCompleted: false,
      requestedStep: 'profile_media',
    });

    expect(result.canLeaveOnboarding).toBe(true);
    expect(result.redirectTarget).toBe('home');
  });

  it('uses profile_habits only as fallback when no persisted draft exists', () => {
    const draft = createEmptyOnboardingDraft(accountId);

    expect(
      resolveOnboardingStepAccess({
        envelope: draft,
        hasPersistedDraft: false,
        legacyCoreProfileCompleted: true,
      }).canLeaveOnboarding,
    ).toBe(true);
    expect(
      resolveOnboardingStepAccess({
        envelope: draft,
        hasPersistedDraft: true,
        legacyCoreProfileCompleted: true,
      }).canLeaveOnboarding,
    ).toBe(false);
  });

  it('maps onboarding URLs to the resolver vocabulary', () => {
    expect(onboardingStepFromPathname('/hero-selection')).toBe(
      'hero_selection',
    );
    expect(onboardingStepFromPathname('/profile-media?from=deeplink')).toBe(
      'profile_media',
    );
    expect(onboardingStepFromPathname('/home')).toBeUndefined();
  });
});

function completeData(): OnboardingDraftData {
  return {
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
    heroIds: ['edras', 'goverra', 'heino'],
    laneIds: ['jungle'],
    profileBasics: { displayName: 'Liqi Pro', gender: 'hidden' },
    rankId: 'master',
  };
}

function envelope(
  input: { data?: OnboardingDraftData; status?: OnboardingStatus } = {},
): OnboardingDraftEnvelope {
  return {
    accountId,
    currentStep: 'profile_media',
    data: input.data ?? completeData(),
    status: input.status ?? 'in_progress',
    updatedAt: '2026-07-13T00:00:00.000Z',
    version: ONBOARDING_DRAFT_VERSION,
  };
}
