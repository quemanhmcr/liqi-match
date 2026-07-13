import { z } from 'zod';

import { heroDefinitionById } from '@/entities/hero';

import { buildRecurringAvailabilityFromTimePreferences } from './availability';
import {
  COMEBACK_RESPONSE_CATALOG,
  COMMUNICATION_PREFERENCE_CATALOG,
  DECISION_STYLE_CATALOG,
  DEFAULT_PROFILE_LOCALE_ID,
  FEEDBACK_STYLE_CATALOG,
  GENDER_CATALOG,
  LANE_CATALOG,
  LOSS_RESPONSE_CATALOG,
  ONBOARDING_DRAFT_ENVELOPE_KIND,
  PROFILE_CONTRACT_VERSION,
  RANK_CATALOG,
  SERIOUSNESS_CATALOG,
  SESSION_LENGTH_CATALOG,
  STRATEGY_STYLE_CATALOG,
  TEAM_ATMOSPHERE_CATALOG,
  TEAM_GOAL_CATALOG,
  TIME_PREFERENCE_CATALOG,
  type CatalogOption,
} from './catalogs';
import {
  PersistedOnboardingDraftEnvelopeSchema,
  TimezoneSchema,
  createEmptyHabitAnswers,
  type HabitAnswersDraft,
  type PersistedOnboardingDraftEnvelope,
} from './schemas';

const LegacyHabitPayloadSchema = z.object({
  comeback_response: z.string(),
  communication_channels: z.array(z.string()),
  decision_style: z.string(),
  feedback_style: z.string(),
  loss_response: z.string(),
  online_time_presets: z.array(z.string()),
  seriousness: z.string(),
  session_length: z.string(),
  strategy_styles: z.array(z.string()),
  team_atmospheres: z.array(z.string()),
  team_goals: z.array(z.string()),
});

const LegacyOnboardingSnapshotSchema = z.object({
  habits: LegacyHabitPayloadSchema.nullable(),
  // Accept a bounded amount of corrupt duplicate legacy state so migration can
  // normalize it before canonical limits are enforced.
  heroIds: z.array(z.string()).max(16),
  laneIds: z.array(z.string()).max(16),
  mediaDraft: z.object({
    avatar: z.boolean(),
    cover: z.boolean(),
    wallCount: z.number().int().min(0).max(4),
  }),
  profileBasics: z.object({
    displayName: z.string(),
    gender: z.string(),
  }),
  rankId: z.string(),
});

export type DraftMigrationIssueCode =
  | 'invalid_persisted_draft'
  | 'unsupported_contract_version'
  | 'unknown_legacy_value'
  | 'legacy_duplicates_removed'
  | 'legacy_display_name_trimmed'
  | 'legacy_game_handle_missing'
  | 'legacy_timezone_missing'
  | 'legacy_availability_expanded_all_days';

export type DraftMigrationIssue = Readonly<{
  code: DraftMigrationIssueCode;
  message: string;
  path: string;
  severity: 'error' | 'warning';
}>;

export type DraftMigrationResult =
  | Readonly<{
      envelope: PersistedOnboardingDraftEnvelope;
      issues: DraftMigrationIssue[];
      status: 'current' | 'migrated';
    }>
  | Readonly<{
      issues: DraftMigrationIssue[];
      status: 'reset-required';
    }>;

export function migratePersistedOnboardingDraft(
  input: unknown,
  options: { now?: () => string; timezone?: string } = {},
): DraftMigrationResult {
  const current = PersistedOnboardingDraftEnvelopeSchema.safeParse(input);
  if (current.success) {
    return { envelope: current.data, issues: [], status: 'current' };
  }

  if (isProfileDraftEnvelope(input)) {
    if (input.version !== PROFILE_CONTRACT_VERSION) {
      return {
        issues: [
          {
            code: 'unsupported_contract_version',
            message: `Unsupported onboarding draft version: ${String(input.version)}.`,
            path: 'version',
            severity: 'error',
          },
        ],
        status: 'reset-required',
      };
    }

    return {
      issues: current.error.issues.map((issue) => ({
        code: 'invalid_persisted_draft',
        message: issue.message,
        path: issue.path.join('.'),
        severity: 'error',
      })),
      status: 'reset-required',
    };
  }

  const legacy = LegacyOnboardingSnapshotSchema.safeParse(input);
  if (!legacy.success) {
    return {
      issues: legacy.error.issues.map((issue) => ({
        code: 'invalid_persisted_draft',
        message: issue.message,
        path: issue.path.join('.'),
        severity: 'error',
      })),
      status: 'reset-required',
    };
  }

  const issues: DraftMigrationIssue[] = [];
  const displayName = legacy.data.profileBasics.displayName.trim();
  if (displayName.length > 20) {
    return resetForUnknown(
      'profileBasics.displayName',
      'Legacy display name exceeds the canonical 20-character limit.',
    );
  }
  if (displayName !== legacy.data.profileBasics.displayName) {
    issues.push({
      code: 'legacy_display_name_trimmed',
      message: 'Trimmed surrounding whitespace from the legacy display name.',
      path: 'profileBasics.displayName',
      severity: 'warning',
    });
  }

  const genderId = idFromLegacyOrCanonical(
    GENDER_CATALOG,
    legacy.data.profileBasics.gender,
  );
  const rankId = idFromLegacyOrCanonical(RANK_CATALOG, legacy.data.rankId);
  const laneIds = dedupe(legacy.data.laneIds, 'laneIds', issues);
  const heroIds = dedupe(legacy.data.heroIds, 'heroIds', issues);
  const unknownLane = laneIds.find(
    (value) => !idFromLegacyOrCanonical(LANE_CATALOG, value),
  );
  const unknownHero = heroIds.find((value) => !heroDefinitionById(value));

  if (!genderId)
    return resetForUnknown('profileBasics.gender', 'Unknown legacy gender.');
  if (!rankId) return resetForUnknown('rankId', 'Unknown legacy rank.');
  if (unknownLane)
    return resetForUnknown('laneIds', `Unknown legacy lane: ${unknownLane}.`);
  if (unknownHero)
    return resetForUnknown('heroIds', `Unknown legacy hero: ${unknownHero}.`);

  const habitsResult = migrateLegacyHabits(legacy.data.habits);
  if (!habitsResult.ok) return habitsResult.result;
  issues.push(...habitsResult.issues);

  const timezone = options.timezone
    ? TimezoneSchema.safeParse(options.timezone)
    : undefined;
  if (options.timezone && !timezone?.success) {
    return resetForUnknown(
      'timezone',
      'Migration timezone is not a valid IANA ID.',
    );
  }

  const canonicalTimezone = timezone?.success ? timezone.data : null;
  if (!canonicalTimezone) {
    issues.push({
      code: 'legacy_timezone_missing',
      message:
        'Legacy drafts had no timezone. Availability remains unanswered until the consumer supplies one.',
      path: 'timezone',
      severity: 'warning',
    });
  }

  const recurringAvailability =
    canonicalTimezone && habitsResult.habits.timePreferenceIds.length > 0
      ? buildRecurringAvailabilityFromTimePreferences({
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          timePreferenceIds: habitsResult.habits.timePreferenceIds,
          timezone: canonicalTimezone,
        })
      : null;
  if (recurringAvailability) {
    issues.push({
      code: 'legacy_availability_expanded_all_days',
      message:
        'Legacy time presets were expanded across all weekdays because the old UI did not capture weekdays.',
      path: 'recurringAvailability',
      severity: 'warning',
    });
  }

  issues.push({
    code: 'legacy_game_handle_missing',
    message:
      'Legacy onboarding did not capture a separate game handle; the canonical field remains unanswered.',
    path: 'profileBasics.gameHandle',
    severity: 'warning',
  });

  const envelopeCandidate = {
    draft: {
      favoriteHeroes: heroIds.map((heroId, index) => ({
        heroId,
        priority: index + 1,
      })),
      habits: habitsResult.habits,
      laneSelection: laneIds[0]
        ? {
            primary: idFromLegacyOrCanonical(LANE_CATALOG, laneIds[0])!,
            secondary: laneIds[1]
              ? idFromLegacyOrCanonical(LANE_CATALOG, laneIds[1])!
              : null,
          }
        : null,
      localeId: DEFAULT_PROFILE_LOCALE_ID,
      matchIntent: null,
      mediaSelection: {
        avatarSelected: legacy.data.mediaDraft.avatar,
        coverSelected: legacy.data.mediaDraft.cover,
        wallPositions: Array.from(
          { length: legacy.data.mediaDraft.wallCount },
          (_, index) => index,
        ),
      },
      profileBasics: {
        displayName,
        gameHandle: null,
        genderId,
      },
      rankId,
      recurringAvailability,
      timezone: canonicalTimezone,
    },
    kind: ONBOARDING_DRAFT_ENVELOPE_KIND,
    savedAt: (options.now ?? (() => new Date().toISOString()))(),
    version: PROFILE_CONTRACT_VERSION,
  };
  const envelope =
    PersistedOnboardingDraftEnvelopeSchema.safeParse(envelopeCandidate);
  if (!envelope.success) {
    return {
      issues: envelope.error.issues.map((issue) => ({
        code: 'invalid_persisted_draft',
        message: issue.message,
        path: issue.path.join('.'),
        severity: 'error',
      })),
      status: 'reset-required',
    };
  }

  return { envelope: envelope.data, issues, status: 'migrated' };
}

function migrateLegacyHabits(
  input: z.infer<typeof LegacyHabitPayloadSchema> | null,
):
  | { habits: HabitAnswersDraft; issues: DraftMigrationIssue[]; ok: true }
  | { ok: false; result: DraftMigrationResult } {
  if (!input)
    return { habits: createEmptyHabitAnswers(), issues: [], ok: true };

  const fields = {
    comebackResponseId: idFromLegacyValue(
      COMEBACK_RESPONSE_CATALOG,
      input.comeback_response,
    ),
    communicationPreferenceIds: idsFromLegacyValues(
      COMMUNICATION_PREFERENCE_CATALOG,
      input.communication_channels,
    ),
    decisionStyleId: idFromLegacyValue(
      DECISION_STYLE_CATALOG,
      input.decision_style,
    ),
    feedbackStyleId: idFromLegacyValue(
      FEEDBACK_STYLE_CATALOG,
      input.feedback_style,
    ),
    lossResponseId: idFromLegacyValue(
      LOSS_RESPONSE_CATALOG,
      input.loss_response,
    ),
    seriousnessId: idFromLegacyValue(SERIOUSNESS_CATALOG, input.seriousness),
    sessionLengthId: idFromLegacyValue(
      SESSION_LENGTH_CATALOG,
      input.session_length,
    ),
    strategyStyleIds: idsFromLegacyValues(
      STRATEGY_STYLE_CATALOG,
      input.strategy_styles,
    ),
    teamAtmosphereIds: idsFromLegacyValues(
      TEAM_ATMOSPHERE_CATALOG,
      input.team_atmospheres,
    ),
    teamGoalIds: idsFromLegacyValues(TEAM_GOAL_CATALOG, input.team_goals),
    timePreferenceIds: idsFromLegacyValues(
      TIME_PREFERENCE_CATALOG,
      input.online_time_presets,
    ),
  };

  const unknown = Object.entries(fields).find(([, value]) =>
    Array.isArray(value) ? value.some((item) => item === undefined) : !value,
  );
  if (unknown) {
    return {
      ok: false,
      result: resetForUnknown(
        `habits.${unknown[0]}`,
        'Legacy habit payload contains an unknown display value.',
      ),
    };
  }

  return {
    habits: fields as HabitAnswersDraft,
    issues: [],
    ok: true,
  };
}

function idFromLegacyOrCanonical<Id extends string>(
  catalog: readonly CatalogOption<Id>[],
  value: string,
): Id | undefined {
  return catalog.find(
    (option) => option.id === value || option.legacyValue === value,
  )?.id;
}

function idFromLegacyValue<Id extends string>(
  catalog: readonly CatalogOption<Id>[],
  value: string,
): Id | undefined {
  return catalog.find((option) => option.legacyValue === value)?.id;
}

function idsFromLegacyValues<Id extends string>(
  catalog: readonly CatalogOption<Id>[],
  values: string[],
): (Id | undefined)[] {
  return values.map((value) => idFromLegacyValue(catalog, value));
}

function dedupe(values: string[], path: string, issues: DraftMigrationIssue[]) {
  const unique = [...new Set(values)];
  if (unique.length !== values.length) {
    issues.push({
      code: 'legacy_duplicates_removed',
      message: 'Removed duplicate values while preserving first-seen order.',
      path,
      severity: 'warning',
    });
  }
  return unique;
}

function resetForUnknown(path: string, message: string): DraftMigrationResult {
  return {
    issues: [
      {
        code: 'unknown_legacy_value',
        message,
        path,
        severity: 'error',
      },
    ],
    status: 'reset-required',
  };
}

function isProfileDraftEnvelope(
  value: unknown,
): value is { kind: string; version: unknown } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'kind' in value &&
    (value as { kind?: unknown }).kind === ONBOARDING_DRAFT_ENVELOPE_KIND &&
    'version' in value
  );
}
