import type { OnboardingDraft } from '@/entities/player-profile';

import {
  ONBOARDING_DRAFT_VERSION,
  type OnboardingDraftData,
  type OnboardingDraftEnvelope,
  type OnboardingStatus,
} from '../model/persisted-onboarding-draft';

export const testAccountId = '01000000-0000-4000-8000-000000000001';

export function completeProfileDraft(): OnboardingDraft {
  return {
    favoriteHeroes: [
      { heroId: 'edras', priority: 1 },
      { heroId: 'goverra', priority: 2 },
      { heroId: 'heino', priority: 3 },
    ],
    habits: {
      comebackResponseId: 'comeback.team-decision',
      communicationPreferenceIds: ['communication.voice-as-needed'],
      decisionStyleId: 'decision.discuss',
      feedbackStyleId: 'feedback.brief',
      lossResponseId: 'loss.short-break',
      seriousnessId: 'seriousness.balanced',
      sessionLengthId: 'session.three-five',
      strategyStyleIds: ['strategy.objectives'],
      teamAtmosphereIds: ['atmosphere.respectful'],
      teamGoalIds: ['goal.rank-climb'],
      timePreferenceIds: ['time.evening'],
    },
    laneSelection: { primary: 'jungle', secondary: null },
    localeId: 'vi-VN',
    matchIntent: null,
    mediaSelection: {
      avatarSelected: false,
      coverSelected: false,
      wallPositions: [],
    },
    profileBasics: {
      displayName: 'Liqi Pro',
      gameHandle: 'LiqiGame#123',
      genderId: 'hidden',
    },
    rankId: 'master',
    recurringAvailability: {
      slots: [
        { dayOfWeek: 0, endMinute: 1440, startMinute: 1080 },
        { dayOfWeek: 6, endMinute: 1440, startMinute: 1080 },
      ],
      timezone: 'Asia/Ho_Chi_Minh',
    },
    timezone: 'Asia/Ho_Chi_Minh',
  };
}

export function completeOnboardingDraftData(): OnboardingDraftData {
  return { profile: completeProfileDraft() };
}

export function onboardingEnvelope(
  input: {
    accountId?: string;
    data?: OnboardingDraftData;
    status?: OnboardingStatus;
  } = {},
): OnboardingDraftEnvelope {
  return {
    accountId: input.accountId ?? testAccountId,
    currentStep: 'profile_media',
    data: input.data ?? completeOnboardingDraftData(),
    status: input.status ?? 'in_progress',
    updatedAt: '2026-07-13T00:00:00.000Z',
    version: ONBOARDING_DRAFT_VERSION,
  };
}
