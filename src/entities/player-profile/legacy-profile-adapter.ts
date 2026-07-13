import { z } from 'zod';

import { heroDefinitionById } from '@/entities/hero';

import { toLegacyAvailabilitySlots } from './availability';
import {
  COMEBACK_RESPONSE_CATALOG,
  COMMUNICATION_PREFERENCE_CATALOG,
  DECISION_STYLE_CATALOG,
  FEEDBACK_STYLE_CATALOG,
  GLOBAL_REGION_LEGACY_VALUE,
  LANE_CATALOG,
  LOCALE_CATALOG,
  LOSS_RESPONSE_CATALOG,
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
  CompletedProfileDraftSchema,
  GenderIdSchema,
  TimezoneSchema,
  type CompletedProfileDraft,
} from './schemas';

function catalogLegacyValues<LegacyValue extends string>(
  catalog: readonly CatalogOption<string, LegacyValue>[],
): [LegacyValue, ...LegacyValue[]] {
  const values = catalog.map((option) => option.legacyValue);
  if (!values[0]) throw new Error('Profile catalog must not be empty.');
  return values as [LegacyValue, ...LegacyValue[]];
}

const LegacyClockTimeSchema = z.string().regex(/^\d{2}:\d{2}:\d{2}$/);
const LegacyRankSlugSchema = z.enum(catalogLegacyValues(RANK_CATALOG));
const LegacyLaneSlugSchema = z.enum(catalogLegacyValues(LANE_CATALOG));
const LegacyLocaleSchema = z.enum(catalogLegacyValues(LOCALE_CATALOG));
const LegacyCommunicationPreferenceSchema = z.enum(
  catalogLegacyValues(COMMUNICATION_PREFERENCE_CATALOG),
);
const LegacyTimePreferenceSchema = z.enum(
  catalogLegacyValues(TIME_PREFERENCE_CATALOG),
);
const LegacySeriousnessSchema = z.enum(
  catalogLegacyValues(SERIOUSNESS_CATALOG),
);
const LegacyDecisionStyleSchema = z.enum(
  catalogLegacyValues(DECISION_STYLE_CATALOG),
);
const LegacySessionLengthSchema = z.enum(
  catalogLegacyValues(SESSION_LENGTH_CATALOG),
);
const LegacyTeamGoalSchema = z.enum(catalogLegacyValues(TEAM_GOAL_CATALOG));
const LegacyStrategyStyleSchema = z.enum(
  catalogLegacyValues(STRATEGY_STYLE_CATALOG),
);
const LegacyTeamAtmosphereSchema = z.enum(
  catalogLegacyValues(TEAM_ATMOSPHERE_CATALOG),
);
const LegacyFeedbackStyleSchema = z.enum(
  catalogLegacyValues(FEEDBACK_STYLE_CATALOG),
);
const LegacyLossResponseSchema = z.enum(
  catalogLegacyValues(LOSS_RESPONSE_CATALOG),
);
const LegacyComebackResponseSchema = z.enum(
  catalogLegacyValues(COMEBACK_RESPONSE_CATALOG),
);

export const LegacyOnboardingRpcPayloadSchema = z
  .object({
    availability_slots: z
      .array(
        z.object({
          day_of_week: z.number().int().min(0).max(6),
          ends_at: LegacyClockTimeSchema,
          starts_at: LegacyClockTimeSchema,
        }),
      )
      .min(1),
    display_name: z.string().min(2).max(40),
    handle: z.string().min(2).max(64),
    habits: z.object({
      comeback_response: LegacyComebackResponseSchema,
      communication_channels: z
        .array(LegacyCommunicationPreferenceSchema)
        .min(1)
        .max(2),
      decision_style: LegacyDecisionStyleSchema,
      feedback_style: LegacyFeedbackStyleSchema,
      loss_response: LegacyLossResponseSchema,
      online_time_presets: z.array(LegacyTimePreferenceSchema).min(1).max(5),
      seriousness: LegacySeriousnessSchema,
      session_length: LegacySessionLengthSchema,
      strategy_styles: z.array(LegacyStrategyStyleSchema).min(1).max(3),
      team_atmospheres: z.array(LegacyTeamAtmosphereSchema).min(1).max(2),
      team_goals: z.array(LegacyTeamGoalSchema).min(1).max(2),
    }),
    heroes: z
      .array(
        z.object({
          name: z.string().min(1),
          role_slug: z.enum([
            'fighter',
            'tank',
            'mage',
            'assassin',
            'support',
            'marksman',
          ]),
          slug: z.string().regex(/^[a-z0-9_]+$/),
        }),
      )
      .length(3),
    languages: z.array(LegacyLocaleSchema).min(1),
    locale: LegacyLocaleSchema,
    media_summary: z.object({
      avatar: z.boolean(),
      contract_version: z.literal(PROFILE_CONTRACT_VERSION),
      cover: z.boolean(),
      profile_basics: z.object({ gender: GenderIdSchema }),
      wall_count: z.number().int().min(0).max(4),
      wall_positions: z.array(z.number().int().min(0).max(3)).max(4),
    }),
    profile_basics: z.object({ gender: GenderIdSchema }),
    rank_slug: LegacyRankSlugSchema,
    regions: z.tuple([z.literal(GLOBAL_REGION_LEGACY_VALUE)]),
    role_slugs: z.array(LegacyLaneSlugSchema).min(1).max(2),
    timezone: TimezoneSchema,
  })
  .strict();

export type LegacyOnboardingRpcPayload = z.infer<
  typeof LegacyOnboardingRpcPayloadSchema
>;

export type LegacyProfileAdapterIssueCode =
  | 'invalid_canonical_profile'
  | 'explicit_game_handle_required'
  | 'legacy_requires_three_heroes'
  | 'lane_priority_not_persisted'
  | 'favorite_hero_priority_not_persisted'
  | 'match_intent_not_persisted'
  | 'media_slot_association_not_persisted'
  | 'wall_media_position_not_persisted'
  | 'availability_midnight_clamped'
  | 'legacy_payload_validation_failed';

export type LegacyProfileAdapterIssue = Readonly<{
  code: LegacyProfileAdapterIssueCode;
  message: string;
  path: string;
  severity: 'error' | 'warning';
}>;

export type LegacyProfileAdapterResult =
  | Readonly<{
      errors: LegacyProfileAdapterIssue[];
      ok: false;
      warnings: LegacyProfileAdapterIssue[];
    }>
  | Readonly<{
      ok: true;
      payload: LegacyOnboardingRpcPayload;
      warnings: LegacyProfileAdapterIssue[];
    }>;

/**
 * The only canonical-to-current-RPC boundary.
 * It never derives domain meaning from Vietnamese labels and never invents
 * Master, Jungle, Mage, heroes, availability, or a game handle.
 */
export function adaptCompletedProfileToLegacyOnboardingPayload(
  input: unknown,
): LegacyProfileAdapterResult {
  const canonical = CompletedProfileDraftSchema.safeParse(input);
  if (!canonical.success) {
    return {
      errors: canonical.error.issues.map((issue) => ({
        code:
          issue.path.join('.') === 'profileBasics.gameHandle'
            ? 'explicit_game_handle_required'
            : 'invalid_canonical_profile',
        message: issue.message,
        path: issue.path.join('.'),
        severity: 'error',
      })),
      ok: false,
      warnings: [],
    };
  }

  const profile = canonical.data;
  const warnings = legacyWarnings(profile);
  if (profile.favoriteHeroes.length !== 3) {
    return {
      errors: [
        {
          code: 'legacy_requires_three_heroes',
          message:
            'The current complete_onboarding RPC requires exactly three heroes.',
          path: 'favoriteHeroes',
          severity: 'error',
        },
      ],
      ok: false,
      warnings,
    };
  }

  const locale = legacyValue(LOCALE_CATALOG, profile.localeId);
  const payload = {
    availability_slots: toLegacyAvailabilitySlots(
      profile.recurringAvailability,
    ),
    display_name: profile.profileBasics.displayName,
    handle: profile.profileBasics.gameHandle,
    habits: {
      comeback_response: legacyValue(
        COMEBACK_RESPONSE_CATALOG,
        profile.habits.comebackResponseId,
      ),
      communication_channels: profile.habits.communicationPreferenceIds.map(
        (id) => legacyValue(COMMUNICATION_PREFERENCE_CATALOG, id),
      ),
      decision_style: legacyValue(
        DECISION_STYLE_CATALOG,
        profile.habits.decisionStyleId,
      ),
      feedback_style: legacyValue(
        FEEDBACK_STYLE_CATALOG,
        profile.habits.feedbackStyleId,
      ),
      loss_response: legacyValue(
        LOSS_RESPONSE_CATALOG,
        profile.habits.lossResponseId,
      ),
      online_time_presets: profile.habits.timePreferenceIds.map((id) =>
        legacyValue(TIME_PREFERENCE_CATALOG, id),
      ),
      seriousness: legacyValue(
        SERIOUSNESS_CATALOG,
        profile.habits.seriousnessId,
      ),
      session_length: legacyValue(
        SESSION_LENGTH_CATALOG,
        profile.habits.sessionLengthId,
      ),
      strategy_styles: profile.habits.strategyStyleIds.map((id) =>
        legacyValue(STRATEGY_STYLE_CATALOG, id),
      ),
      team_atmospheres: profile.habits.teamAtmosphereIds.map((id) =>
        legacyValue(TEAM_ATMOSPHERE_CATALOG, id),
      ),
      team_goals: profile.habits.teamGoalIds.map((id) =>
        legacyValue(TEAM_GOAL_CATALOG, id),
      ),
    },
    heroes: profile.favoriteHeroes.map(({ heroId }) => {
      const hero = heroDefinitionById(heroId);
      if (!hero) throw new Error(`Unknown hero ID after validation: ${heroId}`);
      return {
        name: hero.name,
        role_slug: hero.classSlug,
        slug: hero.legacySlug,
      };
    }),
    languages: [locale],
    locale,
    media_summary: {
      avatar: profile.mediaSelection.avatarSelected,
      contract_version: PROFILE_CONTRACT_VERSION,
      cover: profile.mediaSelection.coverSelected,
      profile_basics: { gender: profile.profileBasics.genderId },
      wall_count: profile.mediaSelection.wallPositions.length,
      wall_positions: profile.mediaSelection.wallPositions,
    },
    profile_basics: { gender: profile.profileBasics.genderId },
    rank_slug: legacyValue(RANK_CATALOG, profile.rankId),
    regions: [GLOBAL_REGION_LEGACY_VALUE] as const,
    role_slugs: [
      legacyValue(LANE_CATALOG, profile.laneSelection.primary),
      ...(profile.laneSelection.secondary
        ? [legacyValue(LANE_CATALOG, profile.laneSelection.secondary)]
        : []),
    ],
    timezone: profile.timezone,
  } satisfies LegacyOnboardingRpcPayload;

  const validatedPayload = LegacyOnboardingRpcPayloadSchema.safeParse(payload);
  if (!validatedPayload.success) {
    return {
      errors: validatedPayload.error.issues.map((issue) => ({
        code: 'legacy_payload_validation_failed',
        message: issue.message,
        path: issue.path.join('.'),
        severity: 'error',
      })),
      ok: false,
      warnings,
    };
  }

  return { ok: true, payload: validatedPayload.data, warnings };
}

function legacyWarnings(
  profile: CompletedProfileDraft,
): LegacyProfileAdapterIssue[] {
  const warnings: LegacyProfileAdapterIssue[] = [];
  if (profile.laneSelection.secondary) {
    warnings.push({
      code: 'lane_priority_not_persisted',
      message:
        'Current profile_roles records do not preserve primary/secondary order.',
      path: 'laneSelection',
      severity: 'warning',
    });
  }
  if (profile.favoriteHeroes.length > 1) {
    warnings.push({
      code: 'favorite_hero_priority_not_persisted',
      message: 'Current profile_heroes records do not preserve priority order.',
      path: 'favoriteHeroes',
      severity: 'warning',
    });
  }
  if (profile.matchIntent) {
    warnings.push({
      code: 'match_intent_not_persisted',
      message: 'The current onboarding RPC has no match-intent persistence.',
      path: 'matchIntent',
      severity: 'warning',
    });
  }
  if (
    profile.mediaSelection.avatarSelected ||
    profile.mediaSelection.coverSelected ||
    profile.mediaSelection.wallPositions.length > 0
  ) {
    warnings.push({
      code: 'media_slot_association_not_persisted',
      message:
        'The RPC stores only media selection summary; uploaded assets are associated later.',
      path: 'mediaSelection',
      severity: 'warning',
    });
  }
  if (profile.mediaSelection.wallPositions.length > 0) {
    warnings.push({
      code: 'wall_media_position_not_persisted',
      message: 'Current media tables do not persist wall position.',
      path: 'mediaSelection.wallPositions',
      severity: 'warning',
    });
  }
  if (
    profile.recurringAvailability.slots.some(
      (slot) => slot.endMinute === 24 * 60,
    )
  ) {
    warnings.push({
      code: 'availability_midnight_clamped',
      message: 'Current SQL time columns represent a 24:00 end as 23:59:59.',
      path: 'recurringAvailability.slots',
      severity: 'warning',
    });
  }
  return warnings;
}

function legacyValue<Id extends string, LegacyValue extends string>(
  catalog: readonly CatalogOption<Id, LegacyValue>[],
  id: Id,
): LegacyValue {
  const option = catalog.find((candidate) => candidate.id === id);
  if (!option) throw new Error(`Catalog has no legacy value for ID: ${id}`);
  return option.legacyValue;
}
