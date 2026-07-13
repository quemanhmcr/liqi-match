import { describe, expect, it } from '@jest/globals';

import { createEmptyOnboardingDraft } from '../model/persisted-onboarding-draft';
import {
  onboardingStepFromPathname,
  resolveOnboardingStepAccess,
} from '../model/onboarding-step-access';

import {
  completeOnboardingDraftData,
  completeProfileDraft,
  onboardingEnvelope,
  testAccountId,
} from './onboarding-test-fixtures';

describe('resolveOnboardingStepAccess', () => {
  it('starts a new user at profile setup without synthetic answers', () => {
    const draft = createEmptyOnboardingDraft(testAccountId);
    const result = resolveOnboardingStepAccess({
      envelope: draft,
      requestedStep: 'profile_setup',
    });

    expect(draft.data.profile).toEqual(
      expect.objectContaining({
        favoriteHeroes: [],
        laneSelection: null,
        profileBasics: {
          displayName: '',
          gameHandle: null,
          genderId: null,
        },
        rankId: null,
      }),
    );
    expect(result.currentStep).toBe('profile_setup');
    expect(result.canLeaveOnboarding).toBe(false);
  });

  it('requires an explicit game handle before rank', () => {
    const profile = completeProfileDraft();
    const result = resolveOnboardingStepAccess({
      envelope: onboardingEnvelope({
        data: {
          profile: {
            ...profile,
            profileBasics: {
              ...profile.profileBasics,
              gameHandle: null,
            },
          },
        },
      }),
      requestedStep: 'rank',
    });

    expect(result.currentStep).toBe('profile_setup');
    expect(result.canAccessRequestedStep).toBe(false);
  });

  it('resumes at rank after canonical profile basics are complete', () => {
    const profile = completeProfileDraft();
    const result = resolveOnboardingStepAccess({
      envelope: onboardingEnvelope({
        data: { profile: { ...profile, rankId: null } },
      }),
      requestedStep: 'rank',
    });

    expect(result.currentStep).toBe('rank');
    expect(result.canAccessRequestedStep).toBe(true);
  });

  it('blocks a deep link that skips prerequisites', () => {
    const profile = completeProfileDraft();
    const result = resolveOnboardingStepAccess({
      envelope: onboardingEnvelope({
        data: { profile: { ...profile, rankId: null } },
      }),
      requestedStep: 'profile_media',
    });

    expect(result.canAccessRequestedStep).toBe(false);
    expect(result.redirectTarget).toBe('rank');
  });

  it('allows media only after the canonical profile is complete', () => {
    const result = resolveOnboardingStepAccess({
      envelope: onboardingEnvelope({ data: completeOnboardingDraftData() }),
      requestedStep: 'profile_media',
    });

    expect(result.canAccessMedia).toBe(true);
    expect(result.redirectTarget).toBeNull();
  });

  it('locks media_pending users to the media step', () => {
    const result = resolveOnboardingStepAccess({
      envelope: onboardingEnvelope({ status: 'media_pending' }),
      requestedStep: 'habits',
    });

    expect(result.canLeaveOnboarding).toBe(false);
    expect(result.currentStep).toBe('profile_media');
    expect(result.redirectTarget).toBe('profile_media');
  });

  it('lets only the completed workflow leave onboarding', () => {
    const result = resolveOnboardingStepAccess({
      envelope: onboardingEnvelope({ status: 'completed' }),
      requestedStep: 'profile_media',
    });

    expect(result.canLeaveOnboarding).toBe(true);
    expect(result.redirectTarget).toBe('home');
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
