import { describe, expect, it } from '@jest/globals';

import {
  ONBOARDING_DRAFT_ENVELOPE_KIND,
  PROFILE_CONTRACT_VERSION,
} from '../catalogs';
import { migratePersistedOnboardingDraft } from '../persisted-draft-migration';
import { createEmptyOnboardingDraft } from '../schemas';

const legacySnapshot = {
  habits: {
    comeback_response: 'Theo quyết định chung của đội',
    communication_channels: ['Voice khi cần', 'Ping/chat là chính'],
    decision_style: 'Cùng trao đổi trước khi quyết định',
    feedback_style: 'Chỉ nhắc ngắn gọn trong trận',
    loss_response: 'Nghỉ 5-15 phút',
    online_time_presets: ['Tối', 'Khuya'],
    seriousness: 'Cân bằng',
    session_length: '3-5 trận',
    strategy_styles: ['Ưu tiên kiểm soát mục tiêu'],
    team_atmospheres: ['Nghiêm túc nhưng tôn trọng'],
    team_goals: ['Leo rank nghiêm túc'],
  },
  heroIds: ['aya', 'nakroth', 'violet'],
  laneIds: ['support', 'jungle'],
  mediaDraft: { avatar: true, cover: false, wallCount: 2 },
  profileBasics: { displayName: ' Liqi Pro ', gender: 'hidden' },
  rankId: 'grandmaster-iv',
};

describe('persisted onboarding draft migration', () => {
  it('returns a current versioned envelope unchanged', () => {
    const envelope = {
      draft: createEmptyOnboardingDraft(),
      kind: ONBOARDING_DRAFT_ENVELOPE_KIND,
      savedAt: '2026-07-13T00:00:00.000Z',
      version: PROFILE_CONTRACT_VERSION,
    };

    expect(migratePersistedOnboardingDraft(envelope)).toEqual({
      envelope,
      issues: [],
      status: 'current',
    });
  });

  it('migrates legacy labels to canonical IDs while preserving order', () => {
    const result = migratePersistedOnboardingDraft(legacySnapshot, {
      now: () => '2026-07-13T01:00:00.000Z',
      timezone: 'Asia/Ho_Chi_Minh',
    });

    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') throw new Error('Expected migration.');

    expect(result.envelope.draft).toMatchObject({
      favoriteHeroes: [
        { heroId: 'aya', priority: 1 },
        { heroId: 'nakroth', priority: 2 },
        { heroId: 'violet', priority: 3 },
      ],
      habits: {
        communicationPreferenceIds: [
          'communication.voice-as-needed',
          'communication.text-ping',
        ],
        seriousnessId: 'seriousness.balanced',
        teamGoalIds: ['goal.rank-climb'],
        timePreferenceIds: ['time.evening', 'time.late-night'],
      },
      laneSelection: { primary: 'support', secondary: 'jungle' },
      mediaSelection: {
        avatarSelected: true,
        coverSelected: false,
        wallPositions: [0, 1],
      },
      profileBasics: {
        displayName: 'Liqi Pro',
        gameHandle: null,
        genderId: 'hidden',
      },
      rankId: 'grandmaster-iv',
      timezone: 'Asia/Ho_Chi_Minh',
    });
    expect(result.envelope.draft.recurringAvailability?.slots.length).toBe(14);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'legacy_display_name_trimmed',
        'legacy_game_handle_missing',
        'legacy_availability_expanded_all_days',
      ]),
    );
  });

  it('keeps availability unanswered when legacy data has no timezone', () => {
    const result = migratePersistedOnboardingDraft(legacySnapshot, {
      now: () => '2026-07-13T01:00:00.000Z',
    });

    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') throw new Error('Expected migration.');
    expect(result.envelope.draft.timezone).toBeNull();
    expect(result.envelope.draft.recurringAvailability).toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'legacy_timezone_missing' }),
      ]),
    );
  });

  it('normalizes exact database hero slugs without parsing hero names', () => {
    const result = migratePersistedOnboardingDraft(
      {
        ...legacySnapshot,
        heroIds: ['flowborn_phep', 'bolt_baron', 'the_flash'],
      },
      { timezone: 'UTC' },
    );

    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') throw new Error('Expected migration.');
    expect(result.envelope.draft.favoriteHeroes).toEqual([
      { heroId: 'flowborn-phep', priority: 1 },
      { heroId: 'bolt-baron', priority: 2 },
      { heroId: 'the-flash', priority: 3 },
    ]);
  });

  it('normalizes duplicate lane and hero values without changing priority', () => {
    const result = migratePersistedOnboardingDraft(
      {
        ...legacySnapshot,
        heroIds: ['aya', 'aya', 'nakroth'],
        laneIds: ['support', 'support', 'jungle'],
      },
      { timezone: 'UTC' },
    );

    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') throw new Error('Expected migration.');
    expect(result.envelope.draft.favoriteHeroes).toEqual([
      { heroId: 'aya', priority: 1 },
      { heroId: 'nakroth', priority: 2 },
    ]);
    expect(result.envelope.draft.laneSelection).toEqual({
      primary: 'support',
      secondary: 'jungle',
    });
    expect(
      result.issues.filter(
        (issue) => issue.code === 'legacy_duplicates_removed',
      ),
    ).toHaveLength(2);
  });

  it('normalizes duplicate legacy habits with an explicit warning', () => {
    const result = migratePersistedOnboardingDraft(
      {
        ...legacySnapshot,
        habits: {
          ...legacySnapshot.habits,
          communication_channels: [
            'Voice khi cần',
            'Voice khi cần',
            'Ping/chat là chính',
          ],
        },
      },
      { timezone: 'UTC' },
    );

    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') throw new Error('Expected migration.');
    expect(result.envelope.draft.habits.communicationPreferenceIds).toEqual([
      'communication.voice-as-needed',
      'communication.text-ping',
    ]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'legacy_duplicates_removed',
          path: 'habits.communicationPreferenceIds.1',
        }),
      ]),
    );
  });

  it('does not invent rank, lane, heroes, handle, habits, or availability', () => {
    const result = migratePersistedOnboardingDraft({
      habits: null,
      heroIds: [],
      laneIds: [],
      mediaDraft: { avatar: false, cover: false, wallCount: 0 },
      profileBasics: { displayName: '', gender: 'hidden' },
      rankId: 'bronze',
    });

    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') throw new Error('Expected migration.');
    expect(result.envelope.draft).toMatchObject({
      favoriteHeroes: [],
      laneSelection: null,
      profileBasics: { displayName: '', gameHandle: null },
      rankId: 'bronze',
      recurringAvailability: null,
      timezone: null,
    });
    expect(result.envelope.draft.habits.teamGoalIds).toEqual([]);
  });

  it('requires reset for unknown legacy values', () => {
    const result = migratePersistedOnboardingDraft({
      ...legacySnapshot,
      habits: {
        ...legacySnapshot.habits,
        seriousness: 'Siêu try-hard',
      },
    });

    expect(result).toMatchObject({
      status: 'reset-required',
      issues: [
        expect.objectContaining({
          code: 'unknown_legacy_value',
          path: 'habits.seriousnessId',
        }),
      ],
    });
  });

  it('classifies a malformed current-version envelope as invalid data', () => {
    const result = migratePersistedOnboardingDraft({
      draft: { ...createEmptyOnboardingDraft(), rankId: 'unknown-rank' },
      kind: ONBOARDING_DRAFT_ENVELOPE_KIND,
      savedAt: '2026-07-13T00:00:00.000Z',
      version: 1,
    });

    expect(result).toMatchObject({
      status: 'reset-required',
      issues: [expect.objectContaining({ code: 'invalid_persisted_draft' })],
    });
  });

  it('requires reset for an unsupported persisted contract version', () => {
    const result = migratePersistedOnboardingDraft({
      draft: createEmptyOnboardingDraft(),
      kind: ONBOARDING_DRAFT_ENVELOPE_KIND,
      savedAt: '2026-07-13T00:00:00.000Z',
      version: 2,
    });

    expect(result).toMatchObject({
      status: 'reset-required',
      issues: [
        expect.objectContaining({ code: 'unsupported_contract_version' }),
      ],
    });
  });
});
