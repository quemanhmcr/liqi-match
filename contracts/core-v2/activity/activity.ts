import { z } from 'zod';

import {
  CoreV2CreateCommandMetadataSchema,
  CoreV2MutationCommandMetadataSchema,
  CoreV2ReceiptBaseSchema,
} from '../commands/command';
import {
  ActivityItemIdSchema,
  EventIdSchema,
  PlayerIdSchema,
  RepeatPlayRequestIdSchema,
  RepeatTeammateRelationshipIdSchema,
} from '../identity/semantic-ids';

const EventfulReceiptBaseV2Schema = CoreV2ReceiptBaseSchema.extend({
  eventIds: z.array(EventIdSchema).min(1).max(20),
});

export const ActivityItemKindV2Schema = z.enum([
  'feedback_prompt',
  'reputation_progress',
  'repeat_play_recommendation',
]);
export type ActivityItemKindV2 = z.infer<typeof ActivityItemKindV2Schema>;

export const ActivityItemV2Schema = z
  .object({
    activityItemId: ActivityItemIdSchema,
    createdAt: z.string().datetime({ offset: true }),
    deduplicationKey: z.string().min(8).max(180),
    dismissedAt: z.string().datetime({ offset: true }).nullable(),
    kind: ActivityItemKindV2Schema,
    payload: z.record(z.string(), z.unknown()),
    playerId: PlayerIdSchema,
    priority: z.number().int().min(0).max(1000),
    version: z.number().int().positive(),
  })
  .strict();
export type ActivityItemV2 = z.infer<typeof ActivityItemV2Schema>;

export const RepeatTeammateRelationshipV2Schema = z
  .object({
    completedSessionCount: z.number().int().min(2),
    firstCompletedAt: z.string().datetime({ offset: true }),
    lastCompletedAt: z.string().datetime({ offset: true }),
    playerHighId: PlayerIdSchema,
    playerLowId: PlayerIdSchema,
    relationshipId: RepeatTeammateRelationshipIdSchema,
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.playerLowId >= value.playerHighId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Repeat teammate IDs must be canonically ordered.',
      });
    }
  });
export type RepeatTeammateRelationshipV2 = z.infer<
  typeof RepeatTeammateRelationshipV2Schema
>;

export const EngagementPreferencesV2Schema = z
  .object({
    activityEnabled: z.boolean(),
    feedbackPromptsEnabled: z.boolean(),
    maxReactivationNotificationsPerDay: z.number().int().min(0).max(4),
    playerId: PlayerIdSchema,
    pushReactivationEnabled: z.boolean(),
    repeatPlayPromptsEnabled: z.boolean(),
    updatedAt: z.string().datetime({ offset: true }),
    version: z.number().int().positive(),
  })
  .strict();
export type EngagementPreferencesV2 = z.infer<
  typeof EngagementPreferencesV2Schema
>;

export const RepeatTeammateVersionExpectationV2Schema = z
  .object({
    teammatePlayerId: PlayerIdSchema,
    version: z.number().int().nonnegative(),
  })
  .strict();

export const RequestRepeatSessionCommandV2Schema =
  CoreV2CreateCommandMetadataSchema.extend({
    relationshipVersions: z
      .array(RepeatTeammateVersionExpectationV2Schema)
      .min(1)
      .max(4),
    teammatePlayerIds: z.array(PlayerIdSchema).min(1).max(4),
  })
    .strict()
    .superRefine((value, ctx) => {
      const teammateIds = value.teammatePlayerIds;
      const relationshipIds = value.relationshipVersions.map(
        (item) => item.teammatePlayerId,
      );
      if (new Set(teammateIds).size !== teammateIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'teammatePlayerIds must be unique.',
        });
      }
      if (new Set(relationshipIds).size !== relationshipIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'relationshipVersions must contain unique teammate IDs.',
        });
      }
      const sortedTeammates = [...teammateIds].sort();
      const sortedRelationships = [...relationshipIds].sort();
      if (
        sortedTeammates.length !== sortedRelationships.length ||
        sortedTeammates.some(
          (teammateId, index) => teammateId !== sortedRelationships[index],
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'relationshipVersions must cover exactly the requested teammates.',
        });
      }
    });
export type RequestRepeatSessionCommandV2 = z.infer<
  typeof RequestRepeatSessionCommandV2Schema
>;

export const RequestRepeatSessionReceiptV2Schema =
  EventfulReceiptBaseV2Schema.extend({
    aggregateType: z.literal('repeat_play_request'),
    commandName: z.literal('request_repeat_session_v2'),
    requestId: RepeatPlayRequestIdSchema,
    resultCode: z.literal('repeat_session_requested'),
    teammatePlayerIds: z.array(PlayerIdSchema).min(1).max(4),
  }).strict();
export type RequestRepeatSessionReceiptV2 = z.infer<
  typeof RequestRepeatSessionReceiptV2Schema
>;

export const DismissActivityItemCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    activityItemId: ActivityItemIdSchema,
  }).strict();
export type DismissActivityItemCommandV2 = z.infer<
  typeof DismissActivityItemCommandV2Schema
>;

export const DismissActivityItemReceiptV2Schema =
  EventfulReceiptBaseV2Schema.extend({
    activityItem: ActivityItemV2Schema,
    aggregateType: z.literal('activity_item'),
    commandName: z.literal('dismiss_activity_item_v2'),
    resultCode: z.literal('activity_item_dismissed'),
  }).strict();
export type DismissActivityItemReceiptV2 = z.infer<
  typeof DismissActivityItemReceiptV2Schema
>;

export const UpdateEngagementPreferencesCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    preferences: EngagementPreferencesV2Schema.pick({
      activityEnabled: true,
      feedbackPromptsEnabled: true,
      maxReactivationNotificationsPerDay: true,
      pushReactivationEnabled: true,
      repeatPlayPromptsEnabled: true,
    }),
  }).strict();
export type UpdateEngagementPreferencesCommandV2 = z.infer<
  typeof UpdateEngagementPreferencesCommandV2Schema
>;

export const UpdateEngagementPreferencesReceiptV2Schema =
  EventfulReceiptBaseV2Schema.extend({
    aggregateType: z.literal('engagement_preferences'),
    commandName: z.literal('update_engagement_preferences_v2'),
    preferences: EngagementPreferencesV2Schema,
    resultCode: z.literal('engagement_preferences_updated'),
  }).strict();
export type UpdateEngagementPreferencesReceiptV2 = z.infer<
  typeof UpdateEngagementPreferencesReceiptV2Schema
>;
