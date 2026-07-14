import { z } from 'zod';

import {
  ActivityItemIdSchema,
  CorrelationIdSchema,
  IdempotencyKeySchema,
  PlayerIdSchema,
  PlaySessionIdSchema,
  RepeatPlayRequestIdSchema,
  RepeatTeammateRelationshipIdSchema,
} from '../identity/semantic-ids';

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

export const RequestRepeatSessionCommandV2Schema = z
  .object({
    correlationId: CorrelationIdSchema,
    expectedAggregateVersion: z.number().int().positive(),
    idempotencyKey: IdempotencyKeySchema,
    teammatePlayerIds: z.array(PlayerIdSchema).min(1).max(9),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.teammatePlayerIds).size !== value.teammatePlayerIds.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'teammatePlayerIds must be unique.',
      });
    }
  });
export type RequestRepeatSessionCommandV2 = z.infer<
  typeof RequestRepeatSessionCommandV2Schema
>;

export const RequestRepeatSessionReceiptV2Schema = z
  .object({
    correlationId: CorrelationIdSchema,
    repeated: z.boolean(),
    requestId: RepeatPlayRequestIdSchema,
    teammatePlayerIds: z.array(PlayerIdSchema).min(1).max(9),
    version: z.number().int().positive(),
  })
  .strict();
export type RequestRepeatSessionReceiptV2 = z.infer<
  typeof RequestRepeatSessionReceiptV2Schema
>;

export const DismissActivityItemCommandV2Schema = z
  .object({
    activityItemId: ActivityItemIdSchema,
    correlationId: CorrelationIdSchema,
    expectedAggregateVersion: z.number().int().positive(),
    idempotencyKey: IdempotencyKeySchema,
  })
  .strict();
export type DismissActivityItemCommandV2 = z.infer<
  typeof DismissActivityItemCommandV2Schema
>;

export const UpdateEngagementPreferencesCommandV2Schema = z
  .object({
    correlationId: CorrelationIdSchema,
    expectedAggregateVersion: z.number().int().positive(),
    idempotencyKey: IdempotencyKeySchema,
    preferences: EngagementPreferencesV2Schema.pick({
      activityEnabled: true,
      feedbackPromptsEnabled: true,
      maxReactivationNotificationsPerDay: true,
      pushReactivationEnabled: true,
      repeatPlayPromptsEnabled: true,
    }),
  })
  .strict();
export type UpdateEngagementPreferencesCommandV2 = z.infer<
  typeof UpdateEngagementPreferencesCommandV2Schema
>;
