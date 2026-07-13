import { z } from 'zod';

import { HERO_DOMAIN_CATALOG, type HeroId } from '@/entities/hero';

import {
  COMEBACK_RESPONSE_CATALOG,
  COMMUNICATION_PREFERENCE_CATALOG,
  DECISION_STYLE_CATALOG,
  DEFAULT_PROFILE_LOCALE_ID,
  FEEDBACK_STYLE_CATALOG,
  GENDER_CATALOG,
  LANE_CATALOG,
  LOCALE_CATALOG,
  LOSS_RESPONSE_CATALOG,
  ONBOARDING_DRAFT_ENVELOPE_KIND,
  PROFILE_CONTRACT_VERSION,
  PROFILE_LIMITS,
  RANK_CATALOG,
  SERIOUSNESS_CATALOG,
  SESSION_LENGTH_CATALOG,
  STRATEGY_STYLE_CATALOG,
  TEAM_ATMOSPHERE_CATALOG,
  TEAM_GOAL_CATALOG,
  TIME_PREFERENCE_CATALOG,
  type ComebackResponseId,
  type CommunicationPreferenceId,
  type DecisionStyleId,
  type FeedbackStyleId,
  type GenderId,
  type LaneSlug,
  type LossResponseId,
  type ProfileLocaleId,
  type RankId,
  type SeriousnessId,
  type SessionLengthId,
  type StrategyStyleId,
  type TeamAtmosphereId,
  type TeamGoalId,
  type TimePreferenceId,
} from './catalogs';

function catalogIds<Id extends string>(
  catalog: readonly { id: Id }[],
): [Id, ...Id[]] {
  const values = catalog.map((option) => option.id);
  if (!values[0]) throw new Error('Profile catalog must not be empty.');
  return values as [Id, ...Id[]];
}

function uniqueArraySchema<T extends z.ZodTypeAny>(
  item: T,
  maximum: number,
  message: string,
) {
  return z
    .array(item)
    .max(maximum)
    .superRefine((values, context) => {
      const seen = new Set<unknown>();
      values.forEach((value, index) => {
        if (seen.has(value)) {
          context.addIssue({
            code: 'custom',
            message,
            path: [index],
          });
        }
        seen.add(value);
      });
    });
}

export const RankIdSchema = z.enum(catalogIds<RankId>(RANK_CATALOG));
export const LaneSlugSchema = z.enum(catalogIds<LaneSlug>(LANE_CATALOG));
export const GenderIdSchema = z.enum(catalogIds<GenderId>(GENDER_CATALOG));
export const ProfileLocaleIdSchema = z.enum(
  catalogIds<ProfileLocaleId>(LOCALE_CATALOG),
);
export const CommunicationPreferenceIdSchema = z.enum(
  catalogIds<CommunicationPreferenceId>(COMMUNICATION_PREFERENCE_CATALOG),
);
export const TimePreferenceIdSchema = z.enum(
  catalogIds<TimePreferenceId>(TIME_PREFERENCE_CATALOG),
);
export const SeriousnessIdSchema = z.enum(
  catalogIds<SeriousnessId>(SERIOUSNESS_CATALOG),
);
export const DecisionStyleIdSchema = z.enum(
  catalogIds<DecisionStyleId>(DECISION_STYLE_CATALOG),
);
export const SessionLengthIdSchema = z.enum(
  catalogIds<SessionLengthId>(SESSION_LENGTH_CATALOG),
);
export const TeamGoalIdSchema = z.enum(
  catalogIds<TeamGoalId>(TEAM_GOAL_CATALOG),
);
export const StrategyStyleIdSchema = z.enum(
  catalogIds<StrategyStyleId>(STRATEGY_STYLE_CATALOG),
);
export const TeamAtmosphereIdSchema = z.enum(
  catalogIds<TeamAtmosphereId>(TEAM_ATMOSPHERE_CATALOG),
);
export const FeedbackStyleIdSchema = z.enum(
  catalogIds<FeedbackStyleId>(FEEDBACK_STYLE_CATALOG),
);
export const LossResponseIdSchema = z.enum(
  catalogIds<LossResponseId>(LOSS_RESPONSE_CATALOG),
);
export const ComebackResponseIdSchema = z.enum(
  catalogIds<ComebackResponseId>(COMEBACK_RESPONSE_CATALOG),
);

export const HeroIdSchema = z.enum(catalogIds<HeroId>(HERO_DOMAIN_CATALOG));

export const TimezoneSchema = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, 'Timezone must be a valid IANA timezone.');

export const DayOfWeekSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const AvailabilitySlotSchema = z
  .object({
    dayOfWeek: DayOfWeekSchema,
    endMinute: z
      .number()
      .int()
      .min(0)
      .max(24 * 60),
    startMinute: z
      .number()
      .int()
      .min(0)
      .max(24 * 60 - 1),
  })
  .superRefine((slot, context) => {
    if (slot.startMinute === slot.endMinute) {
      context.addIssue({
        code: 'custom',
        message: 'Availability slot must have a non-zero duration.',
        path: ['endMinute'],
      });
    }
  });

export const RecurringAvailabilitySchema = z.object({
  slots: z.array(AvailabilitySlotSchema).max(7 * 12),
  timezone: TimezoneSchema,
});

export const LaneSelectionSchema = z
  .object({
    primary: LaneSlugSchema,
    secondary: LaneSlugSchema.nullable(),
  })
  .superRefine((selection, context) => {
    if (selection.secondary === selection.primary) {
      context.addIssue({
        code: 'custom',
        message: 'Secondary lane must differ from primary lane.',
        path: ['secondary'],
      });
    }
  });

export const FavoriteHeroSelectionSchema = z.object({
  heroId: HeroIdSchema,
  priority: z.number().int().min(1).max(PROFILE_LIMITS.favoriteHeroes),
});

function favoriteHeroListSchema(minimum: number) {
  return z
    .array(FavoriteHeroSelectionSchema)
    .min(minimum)
    .max(PROFILE_LIMITS.favoriteHeroes)
    .superRefine((heroes, context) => {
      const seenHeroes = new Set<string>();
      heroes.forEach((hero, index) => {
        if (seenHeroes.has(hero.heroId)) {
          context.addIssue({
            code: 'custom',
            message: 'Favorite hero IDs must be unique.',
            path: [index, 'heroId'],
          });
        }
        seenHeroes.add(hero.heroId);
        if (hero.priority !== index + 1) {
          context.addIssue({
            code: 'custom',
            message: 'Favorite hero priority must match array order.',
            path: [index, 'priority'],
          });
        }
      });
    });
}

export const FavoriteHeroSelectionsSchema = favoriteHeroListSchema(0);
export const CompletedFavoriteHeroSelectionsSchema = favoriteHeroListSchema(1);

export const HabitAnswersDraftSchema = z.object({
  comebackResponseId: ComebackResponseIdSchema.nullable(),
  communicationPreferenceIds: uniqueArraySchema(
    CommunicationPreferenceIdSchema,
    PROFILE_LIMITS.communicationPreferences,
    'Communication preference IDs must be unique.',
  ),
  decisionStyleId: DecisionStyleIdSchema.nullable(),
  feedbackStyleId: FeedbackStyleIdSchema.nullable(),
  lossResponseId: LossResponseIdSchema.nullable(),
  seriousnessId: SeriousnessIdSchema.nullable(),
  sessionLengthId: SessionLengthIdSchema.nullable(),
  strategyStyleIds: uniqueArraySchema(
    StrategyStyleIdSchema,
    PROFILE_LIMITS.strategyStyles,
    'Strategy style IDs must be unique.',
  ),
  teamAtmosphereIds: uniqueArraySchema(
    TeamAtmosphereIdSchema,
    PROFILE_LIMITS.teamAtmospheres,
    'Team atmosphere IDs must be unique.',
  ),
  teamGoalIds: uniqueArraySchema(
    TeamGoalIdSchema,
    PROFILE_LIMITS.teamGoals,
    'Team goal IDs must be unique.',
  ),
  timePreferenceIds: uniqueArraySchema(
    TimePreferenceIdSchema,
    TIME_PREFERENCE_CATALOG.length,
    'Time preference IDs must be unique.',
  ),
});

export const CompletedHabitAnswersSchema = z.object({
  comebackResponseId: ComebackResponseIdSchema,
  communicationPreferenceIds: uniqueArraySchema(
    CommunicationPreferenceIdSchema,
    PROFILE_LIMITS.communicationPreferences,
    'Communication preference IDs must be unique.',
  ).refine((values) => values.length > 0, 'Choose a communication preference.'),
  decisionStyleId: DecisionStyleIdSchema,
  feedbackStyleId: FeedbackStyleIdSchema,
  lossResponseId: LossResponseIdSchema,
  seriousnessId: SeriousnessIdSchema,
  sessionLengthId: SessionLengthIdSchema,
  strategyStyleIds: uniqueArraySchema(
    StrategyStyleIdSchema,
    PROFILE_LIMITS.strategyStyles,
    'Strategy style IDs must be unique.',
  ).refine((values) => values.length > 0, 'Choose a strategy style.'),
  teamAtmosphereIds: uniqueArraySchema(
    TeamAtmosphereIdSchema,
    PROFILE_LIMITS.teamAtmospheres,
    'Team atmosphere IDs must be unique.',
  ).refine((values) => values.length > 0, 'Choose a team atmosphere.'),
  teamGoalIds: uniqueArraySchema(
    TeamGoalIdSchema,
    PROFILE_LIMITS.teamGoals,
    'Team goal IDs must be unique.',
  ).refine((values) => values.length > 0, 'Choose a team goal.'),
  timePreferenceIds: uniqueArraySchema(
    TimePreferenceIdSchema,
    TIME_PREFERENCE_CATALOG.length,
    'Time preference IDs must be unique.',
  ).refine((values) => values.length > 0, 'Choose an online time preference.'),
});

export const MediaSelectionSummarySchema = z
  .object({
    avatarSelected: z.boolean(),
    coverSelected: z.boolean(),
    wallPositions: uniqueArraySchema(
      z
        .number()
        .int()
        .min(0)
        .max(PROFILE_LIMITS.wallMedia - 1),
      PROFILE_LIMITS.wallMedia,
      'Wall media positions must be unique.',
    ),
  })
  .strict();

export const MatchIntentKindSchema = z.enum([
  'casual-play',
  'rank-climb',
  'team-rank',
  'long-term-duo',
]);

const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const MatchIntentSchema = z
  .object({
    activeFrom: IsoDateTimeSchema.nullable(),
    activeUntil: IsoDateTimeSchema.nullable(),
    communicationPreferenceIds: uniqueArraySchema(
      CommunicationPreferenceIdSchema,
      PROFILE_LIMITS.communicationPreferences,
      'Communication preference IDs must be unique.',
    ),
    heroIds: uniqueArraySchema(
      HeroIdSchema,
      PROFILE_LIMITS.favoriteHeroes,
      'Match intent hero IDs must be unique.',
    ),
    kind: MatchIntentKindSchema,
    laneSelection: LaneSelectionSchema.nullable(),
    note: z.string().trim().max(PROFILE_LIMITS.matchIntentNote),
    teamGoalIds: uniqueArraySchema(
      TeamGoalIdSchema,
      PROFILE_LIMITS.teamGoals,
      'Team goal IDs must be unique.',
    ),
  })
  .superRefine((intent, context) => {
    if (
      intent.activeFrom &&
      intent.activeUntil &&
      Date.parse(intent.activeUntil) <= Date.parse(intent.activeFrom)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Match intent must end after it starts.',
        path: ['activeUntil'],
      });
    }
  });

export const OnboardingProfileBasicsDraftSchema = z.object({
  displayName: z.string().trim().max(PROFILE_LIMITS.displayName),
  gameHandle: z
    .string()
    .trim()
    .min(2)
    .max(PROFILE_LIMITS.gameHandle)
    .nullable(),
  genderId: GenderIdSchema.nullable(),
});

export const CompletedProfileBasicsSchema = z.object({
  displayName: z.string().trim().min(2).max(PROFILE_LIMITS.displayName),
  gameHandle: z.string().trim().min(2).max(PROFILE_LIMITS.gameHandle),
  genderId: GenderIdSchema,
});

export const OnboardingDraftSchema = z.object({
  favoriteHeroes: FavoriteHeroSelectionsSchema,
  habits: HabitAnswersDraftSchema,
  laneSelection: LaneSelectionSchema.nullable(),
  localeId: ProfileLocaleIdSchema,
  matchIntent: MatchIntentSchema.nullable(),
  mediaSelection: MediaSelectionSummarySchema,
  profileBasics: OnboardingProfileBasicsDraftSchema,
  rankId: RankIdSchema.nullable(),
  recurringAvailability: RecurringAvailabilitySchema.nullable(),
  timezone: TimezoneSchema.nullable(),
});

export const CompletedProfileDraftSchema = z
  .object({
    favoriteHeroes: CompletedFavoriteHeroSelectionsSchema,
    habits: CompletedHabitAnswersSchema,
    laneSelection: LaneSelectionSchema,
    localeId: ProfileLocaleIdSchema,
    matchIntent: MatchIntentSchema.nullable(),
    mediaSelection: MediaSelectionSummarySchema,
    profileBasics: CompletedProfileBasicsSchema,
    rankId: RankIdSchema,
    recurringAvailability: RecurringAvailabilitySchema.refine(
      (value) => value.slots.length > 0,
      'Completed profile requires recurring availability.',
    ),
    timezone: TimezoneSchema,
  })
  .superRefine((profile, context) => {
    if (profile.recurringAvailability.timezone !== profile.timezone) {
      context.addIssue({
        code: 'custom',
        message: 'Availability timezone must match profile timezone.',
        path: ['recurringAvailability', 'timezone'],
      });
    }
  });

export const PersistedOnboardingDraftEnvelopeSchema = z
  .object({
    draft: OnboardingDraftSchema,
    kind: z.literal(ONBOARDING_DRAFT_ENVELOPE_KIND),
    savedAt: IsoDateTimeSchema,
    version: z.literal(PROFILE_CONTRACT_VERSION),
  })
  .strict();

/** Sunday = 0 through Saturday = 6, matching the current database contract. */
export type AvailabilityDayOfWeek = z.infer<typeof DayOfWeekSchema>;
export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;
export type RecurringAvailability = z.infer<typeof RecurringAvailabilitySchema>;
export type LaneSelection = z.infer<typeof LaneSelectionSchema>;
export type FavoriteHeroSelection = z.infer<typeof FavoriteHeroSelectionSchema>;
export type HabitAnswersDraft = z.infer<typeof HabitAnswersDraftSchema>;
export type CompletedHabitAnswers = z.infer<typeof CompletedHabitAnswersSchema>;
export type MediaSelectionSummary = z.infer<typeof MediaSelectionSummarySchema>;
export type MatchIntent = z.infer<typeof MatchIntentSchema>;
export type OnboardingDraft = z.infer<typeof OnboardingDraftSchema>;
export type CompletedProfileDraft = z.infer<typeof CompletedProfileDraftSchema>;
export type PersistedOnboardingDraftEnvelope = z.infer<
  typeof PersistedOnboardingDraftEnvelopeSchema
>;

export function createEmptyHabitAnswers(): HabitAnswersDraft {
  return {
    comebackResponseId: null,
    communicationPreferenceIds: [],
    decisionStyleId: null,
    feedbackStyleId: null,
    lossResponseId: null,
    seriousnessId: null,
    sessionLengthId: null,
    strategyStyleIds: [],
    teamAtmosphereIds: [],
    teamGoalIds: [],
    timePreferenceIds: [],
  };
}

export function createEmptyOnboardingDraft(input?: {
  localeId?: ProfileLocaleId;
}): OnboardingDraft {
  return {
    favoriteHeroes: [],
    habits: createEmptyHabitAnswers(),
    laneSelection: null,
    localeId: input?.localeId ?? DEFAULT_PROFILE_LOCALE_ID,
    matchIntent: null,
    mediaSelection: {
      avatarSelected: false,
      coverSelected: false,
      wallPositions: [],
    },
    profileBasics: {
      displayName: '',
      gameHandle: null,
      genderId: null,
    },
    rankId: null,
    recurringAvailability: null,
    timezone: null,
  };
}
