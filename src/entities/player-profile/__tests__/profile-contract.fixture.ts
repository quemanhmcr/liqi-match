import { buildRecurringAvailabilityFromTimePreferences } from '../availability';
import type { CompletedProfileDraft } from '../schemas';

export function completedProfileFixture(
  overrides: Partial<CompletedProfileDraft> = {},
): CompletedProfileDraft {
  return {
    favoriteHeroes: [
      { heroId: 'aya', priority: 1 },
      { heroId: 'nakroth', priority: 2 },
      { heroId: 'violet', priority: 3 },
    ],
    habits: {
      comebackResponseId: 'comeback.team-decision',
      communicationPreferenceIds: [
        'communication.voice-as-needed',
        'communication.text-ping',
      ],
      decisionStyleId: 'decision.discuss',
      feedbackStyleId: 'feedback.brief',
      lossResponseId: 'loss.short-break',
      seriousnessId: 'seriousness.balanced',
      sessionLengthId: 'session.three-five',
      strategyStyleIds: ['strategy.objectives', 'strategy.macro'],
      teamAtmosphereIds: ['atmosphere.respectful'],
      teamGoalIds: ['goal.rank-climb', 'goal.stable-teamwork'],
      timePreferenceIds: ['time.evening', 'time.late-night'],
    },
    laneSelection: { primary: 'jungle', secondary: 'support' },
    localeId: 'vi-VN',
    matchIntent: {
      activeFrom: '2026-07-13T12:00:00.000Z',
      activeUntil: '2026-07-13T15:00:00.000Z',
      communicationPreferenceIds: ['communication.voice-as-needed'],
      heroIds: ['aya'],
      kind: 'rank-climb',
      laneSelection: { primary: 'support', secondary: null },
      note: 'Leo rank buổi tối',
      teamGoalIds: ['goal.rank-climb'],
    },
    mediaSelection: {
      avatarSelected: true,
      coverSelected: true,
      wallPositions: [0, 2],
    },
    profileBasics: {
      displayName: 'Liqi Pro',
      gameHandle: 'LiqiPro#001',
      genderId: 'hidden',
    },
    rankId: 'grandmaster-iv',
    recurringAvailability: buildRecurringAvailabilityFromTimePreferences({
      daysOfWeek: [1, 3, 5],
      timePreferenceIds: ['time.evening', 'time.late-night'],
      timezone: 'Asia/Ho_Chi_Minh',
    }),
    timezone: 'Asia/Ho_Chi_Minh',
    ...overrides,
  };
}
