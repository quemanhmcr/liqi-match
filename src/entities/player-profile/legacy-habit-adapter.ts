import { z } from 'zod';

import {
  COMEBACK_RESPONSE_CATALOG,
  COMMUNICATION_PREFERENCE_CATALOG,
  DECISION_STYLE_CATALOG,
  FEEDBACK_STYLE_CATALOG,
  LOSS_RESPONSE_CATALOG,
  PROFILE_LIMITS,
  SERIOUSNESS_CATALOG,
  SESSION_LENGTH_CATALOG,
  STRATEGY_STYLE_CATALOG,
  TEAM_ATMOSPHERE_CATALOG,
  TEAM_GOAL_CATALOG,
  TIME_PREFERENCE_CATALOG,
  type CatalogOption,
} from './catalogs';
import { resolveCatalogId } from './legacy-value-resolver';
import {
  HabitAnswersDraftSchema,
  createEmptyHabitAnswers,
  type HabitAnswersDraft,
} from './schemas';

export const LegacyHabitAnswersInputSchema = z
  .object({
    comeback_response: z.unknown().optional(),
    communication_channels: z.unknown().optional(),
    decision_style: z.unknown().optional(),
    feedback_style: z.unknown().optional(),
    loss_response: z.unknown().optional(),
    online_time_presets: z.unknown().optional(),
    seriousness: z.unknown().optional(),
    session_length: z.unknown().optional(),
    strategy_styles: z.unknown().optional(),
    team_atmospheres: z.unknown().optional(),
    team_goals: z.unknown().optional(),
  })
  .passthrough();

export type LegacyHabitAdapterIssueCode =
  | 'invalid_legacy_habit_payload'
  | 'invalid_legacy_value_shape'
  | 'unknown_legacy_value'
  | 'duplicate_legacy_value'
  | 'legacy_value_limit_exceeded'
  | 'canonical_validation_failed';

export type LegacyHabitAdapterIssue = Readonly<{
  code: LegacyHabitAdapterIssueCode;
  message: string;
  path: string;
  severity: 'error' | 'warning';
  value?: unknown;
}>;

export type LegacyHabitAdapterResult = Readonly<{
  /** False means the caller must preserve/report the original backend value. */
  lossless: boolean;
  issues: LegacyHabitAdapterIssue[];
  value: HabitAnswersDraft;
}>;

/**
 * Converts current profile_habits text values to canonical IDs.
 *
 * Missing/null fields remain unanswered. Unknown, malformed or over-limit
 * values are never guessed; they are excluded from the canonical value and
 * returned as explicit issues so Profile Edit can preserve/report them.
 */
export function adaptLegacyHabitAnswers(
  input: unknown,
): LegacyHabitAdapterResult {
  if (input === null || input === undefined) {
    return { issues: [], lossless: true, value: createEmptyHabitAnswers() };
  }

  const parsed = LegacyHabitAnswersInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((issue) => ({
        code: 'invalid_legacy_habit_payload',
        message: issue.message,
        path: issue.path.join('.'),
        severity: 'error',
      })),
      lossless: false,
      value: createEmptyHabitAnswers(),
    };
  }

  const issues: LegacyHabitAdapterIssue[] = [];
  const value = {
    comebackResponseId: resolveOptionalCatalogValue(
      COMEBACK_RESPONSE_CATALOG,
      parsed.data.comeback_response,
      'comebackResponseId',
      issues,
    ),
    communicationPreferenceIds: resolveCatalogValueList(
      COMMUNICATION_PREFERENCE_CATALOG,
      parsed.data.communication_channels,
      'communicationPreferenceIds',
      PROFILE_LIMITS.communicationPreferences,
      issues,
    ),
    decisionStyleId: resolveOptionalCatalogValue(
      DECISION_STYLE_CATALOG,
      parsed.data.decision_style,
      'decisionStyleId',
      issues,
    ),
    feedbackStyleId: resolveOptionalCatalogValue(
      FEEDBACK_STYLE_CATALOG,
      parsed.data.feedback_style,
      'feedbackStyleId',
      issues,
    ),
    lossResponseId: resolveOptionalCatalogValue(
      LOSS_RESPONSE_CATALOG,
      parsed.data.loss_response,
      'lossResponseId',
      issues,
    ),
    seriousnessId: resolveOptionalCatalogValue(
      SERIOUSNESS_CATALOG,
      parsed.data.seriousness,
      'seriousnessId',
      issues,
    ),
    sessionLengthId: resolveOptionalCatalogValue(
      SESSION_LENGTH_CATALOG,
      parsed.data.session_length,
      'sessionLengthId',
      issues,
    ),
    strategyStyleIds: resolveCatalogValueList(
      STRATEGY_STYLE_CATALOG,
      parsed.data.strategy_styles,
      'strategyStyleIds',
      PROFILE_LIMITS.strategyStyles,
      issues,
    ),
    teamAtmosphereIds: resolveCatalogValueList(
      TEAM_ATMOSPHERE_CATALOG,
      parsed.data.team_atmospheres,
      'teamAtmosphereIds',
      PROFILE_LIMITS.teamAtmospheres,
      issues,
    ),
    teamGoalIds: resolveCatalogValueList(
      TEAM_GOAL_CATALOG,
      parsed.data.team_goals,
      'teamGoalIds',
      PROFILE_LIMITS.teamGoals,
      issues,
    ),
    timePreferenceIds: resolveCatalogValueList(
      TIME_PREFERENCE_CATALOG,
      parsed.data.online_time_presets,
      'timePreferenceIds',
      TIME_PREFERENCE_CATALOG.length,
      issues,
    ),
  } satisfies HabitAnswersDraft;

  const canonical = HabitAnswersDraftSchema.safeParse(value);
  if (!canonical.success) {
    return {
      issues: [
        ...issues,
        ...canonical.error.issues.map((issue) => ({
          code: 'canonical_validation_failed' as const,
          message: issue.message,
          path: issue.path.join('.'),
          severity: 'error' as const,
        })),
      ],
      lossless: false,
      value: createEmptyHabitAnswers(),
    };
  }

  return {
    issues,
    lossless: issues.every((issue) => issue.severity !== 'error'),
    value: canonical.data,
  };
}

function resolveOptionalCatalogValue<
  const Options extends readonly CatalogOption<string, string>[],
>(
  options: Options,
  input: unknown,
  path: string,
  issues: LegacyHabitAdapterIssue[],
): Options[number]['id'] | null {
  if (input === null || input === undefined) return null;

  const result = resolveCatalogId(options, input);
  if (result.ok) return result.id;

  issues.push({
    code:
      result.code === 'invalid_value_type'
        ? 'invalid_legacy_value_shape'
        : 'unknown_legacy_value',
    message:
      result.code === 'invalid_value_type'
        ? 'Legacy habit value must be a string.'
        : 'Legacy habit value is not present in the canonical catalog.',
    path,
    severity: 'error',
    value: input,
  });
  return null;
}

function resolveCatalogValueList<
  const Options extends readonly CatalogOption<string, string>[],
>(
  options: Options,
  input: unknown,
  path: string,
  limit: number,
  issues: LegacyHabitAdapterIssue[],
): Options[number]['id'][] {
  if (input === null || input === undefined) return [];
  if (!Array.isArray(input)) {
    issues.push({
      code: 'invalid_legacy_value_shape',
      message: 'Legacy multi-select habit value must be an array.',
      path,
      severity: 'error',
      value: input,
    });
    return [];
  }

  const values: Options[number]['id'][] = [];
  const seen = new Set<string>();
  input.forEach((item, index) => {
    const result = resolveCatalogId(options, item);
    if (!result.ok) {
      issues.push({
        code:
          result.code === 'invalid_value_type'
            ? 'invalid_legacy_value_shape'
            : 'unknown_legacy_value',
        message:
          result.code === 'invalid_value_type'
            ? 'Legacy habit list item must be a string.'
            : 'Legacy habit list item is not present in the canonical catalog.',
        path: `${path}.${index}`,
        severity: 'error',
        value: item,
      });
      return;
    }

    if (seen.has(result.id)) {
      issues.push({
        code: 'duplicate_legacy_value',
        message: 'Duplicate legacy habit value was removed.',
        path: `${path}.${index}`,
        severity: 'warning',
        value: item,
      });
      return;
    }
    seen.add(result.id);

    if (values.length >= limit) {
      issues.push({
        code: 'legacy_value_limit_exceeded',
        message: `Legacy habit selection exceeds the canonical limit of ${limit}.`,
        path: `${path}.${index}`,
        severity: 'error',
        value: item,
      });
      return;
    }

    values.push(result.id);
  });
  return values;
}
