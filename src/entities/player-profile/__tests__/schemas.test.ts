import { describe, expect, it } from '@jest/globals';

import {
  CompletedProfileDraftSchema,
  FavoriteHeroSelectionsSchema,
  LaneSelectionSchema,
  MatchIntentSchema,
  OnboardingDraftSchema,
  PersistedOnboardingDraftEnvelopeSchema,
  createEmptyOnboardingDraft,
} from '../schemas';
import { completedProfileFixture } from './profile-contract.fixture';

describe('profile runtime schemas', () => {
  it('represents unanswered onboarding fields without fake defaults', () => {
    const draft = createEmptyOnboardingDraft();

    expect(OnboardingDraftSchema.parse(draft)).toEqual(draft);
    expect(draft).toMatchObject({
      favoriteHeroes: [],
      laneSelection: null,
      profileBasics: {
        displayName: '',
        gameHandle: null,
        genderId: null,
      },
      rankId: null,
      recurringAvailability: null,
      timezone: null,
    });
    expect(draft.habits.communicationPreferenceIds).toEqual([]);
    expect(draft.habits.seriousnessId).toBeNull();
  });

  it('validates a completed canonical profile draft', () => {
    const profile = completedProfileFixture();

    expect(CompletedProfileDraftSchema.parse(profile)).toEqual(profile);
  });

  it('rejects unknown rank, lane, habit, and hero IDs', () => {
    const profile = completedProfileFixture();

    expect(
      CompletedProfileDraftSchema.safeParse({
        ...profile,
        rankId: 'Cao Thủ',
      }).success,
    ).toBe(false);
    expect(
      LaneSelectionSchema.safeParse({ primary: 'Đi Rừng', secondary: null })
        .success,
    ).toBe(false);
    expect(
      CompletedProfileDraftSchema.safeParse({
        ...profile,
        habits: {
          ...profile.habits,
          seriousnessId: 'Cân bằng',
        },
      }).success,
    ).toBe(false);
    expect(
      FavoriteHeroSelectionsSchema.safeParse([
        { heroId: 'unknown-hero', priority: 1 },
      ]).success,
    ).toBe(false);
  });

  it('preserves lane order and rejects duplicate lane semantics', () => {
    expect(
      LaneSelectionSchema.parse({ primary: 'support', secondary: 'jungle' }),
    ).toEqual({ primary: 'support', secondary: 'jungle' });
    expect(
      LaneSelectionSchema.safeParse({
        primary: 'support',
        secondary: 'support',
      }).success,
    ).toBe(false);
  });

  it('requires favorite hero priority to be unique and match array order', () => {
    expect(
      FavoriteHeroSelectionsSchema.safeParse([
        { heroId: 'aya', priority: 2 },
        { heroId: 'nakroth', priority: 1 },
      ]).success,
    ).toBe(false);
    expect(
      FavoriteHeroSelectionsSchema.safeParse([
        { heroId: 'aya', priority: 1 },
        { heroId: 'aya', priority: 2 },
      ]).success,
    ).toBe(false);
  });

  it('enforces habit limits and rejects unanswered completed fields', () => {
    const profile = completedProfileFixture();

    expect(
      CompletedProfileDraftSchema.safeParse({
        ...profile,
        habits: {
          ...profile.habits,
          communicationPreferenceIds: [
            'communication.voice-proactive',
            'communication.voice-as-needed',
            'communication.text-ping',
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      CompletedProfileDraftSchema.safeParse({
        ...profile,
        profileBasics: {
          ...profile.profileBasics,
          gameHandle: null,
        },
      }).success,
    ).toBe(false);
    expect(
      CompletedProfileDraftSchema.safeParse({
        ...profile,
        habits: {
          ...profile.habits,
          teamGoalIds: [],
        },
      }).success,
    ).toBe(false);
  });

  it('keeps current match intent separate and time-bounded', () => {
    expect(
      MatchIntentSchema.safeParse({
        activeFrom: '2026-07-13T15:00:00.000Z',
        activeUntil: '2026-07-13T12:00:00.000Z',
        communicationPreferenceIds: [],
        heroIds: [],
        kind: 'rank-climb',
        laneSelection: null,
        note: '',
        teamGoalIds: [],
      }).success,
    ).toBe(false);
  });

  it('requires the persisted draft contract version', () => {
    const envelope = {
      draft: createEmptyOnboardingDraft(),
      kind: 'liqi.onboarding-draft',
      savedAt: '2026-07-13T00:00:00.000Z',
      version: 1,
    };

    expect(PersistedOnboardingDraftEnvelopeSchema.parse(envelope)).toEqual(
      envelope,
    );
    expect(
      PersistedOnboardingDraftEnvelopeSchema.safeParse({
        ...envelope,
        version: 2,
      }).success,
    ).toBe(false);
  });
});
