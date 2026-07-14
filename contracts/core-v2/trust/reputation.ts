import { z } from 'zod';

import {
  CorrelationIdSchema,
  IdempotencyKeySchema,
  PlayerEndorsementIdSchema,
  PlayerIdSchema,
  PlaySessionIdSchema,
  ReputationLedgerEntryIdSchema,
} from '../identity/semantic-ids';

export const EndorsementKindV2Schema = z.enum([
  'good_communication',
  'on_time',
  'cooperative',
  'role_reliable',
  'positive_attitude',
  'would_play_again',
]);
export type EndorsementKindV2 = z.infer<typeof EndorsementKindV2Schema>;

export const ReputationDimensionV2Schema = z.enum([
  'completed_sessions',
  'no_show_count',
  'positive_endorsements',
  'repeat_teammate_count',
  'confirmed_moderation_actions',
]);
export type ReputationDimensionV2 = z.infer<typeof ReputationDimensionV2Schema>;

export const PlayerEndorsementV2Schema = z
  .object({
    actorPlayerId: PlayerIdSchema,
    createdAt: z.string().datetime({ offset: true }),
    endorsementId: PlayerEndorsementIdSchema,
    kinds: z.array(EndorsementKindV2Schema).min(1).max(6),
    sessionId: PlaySessionIdSchema,
    targetPlayerId: PlayerIdSchema,
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.actorPlayerId === value.targetPlayerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Players cannot endorse themselves.',
      });
    }
    if (new Set(value.kinds).size !== value.kinds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Endorsement kinds must be unique.',
      });
    }
  });
export type PlayerEndorsementV2 = z.infer<typeof PlayerEndorsementV2Schema>;

export const SubmitPlayerEndorsementCommandV2Schema = z
  .object({
    correlationId: CorrelationIdSchema,
    expectedAggregateVersion: z.number().int().positive(),
    idempotencyKey: IdempotencyKeySchema,
    kinds: z.array(EndorsementKindV2Schema).min(1).max(6),
    sessionId: PlaySessionIdSchema,
    targetPlayerId: PlayerIdSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.kinds).size !== value.kinds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Endorsement kinds must be unique.',
      });
    }
  });
export type SubmitPlayerEndorsementCommandV2 = z.infer<
  typeof SubmitPlayerEndorsementCommandV2Schema
>;

export const SubmitPlayerEndorsementReceiptV2Schema = z
  .object({
    correlationId: CorrelationIdSchema,
    endorsement: PlayerEndorsementV2Schema,
    repeated: z.boolean(),
  })
  .strict();
export type SubmitPlayerEndorsementReceiptV2 = z.infer<
  typeof SubmitPlayerEndorsementReceiptV2Schema
>;

export const ReputationLedgerEntryV2Schema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
    delta: z.number().int(),
    dimension: ReputationDimensionV2Schema,
    entryId: ReputationLedgerEntryIdSchema,
    metadata: z.record(z.string(), z.unknown()),
    playerId: PlayerIdSchema,
    sourceId: z.string().uuid(),
    sourceType: z.enum([
      'participation_confirmation',
      'endorsement',
      'repeat_teammate',
      'moderation_action',
    ]),
  })
  .strict();
export type ReputationLedgerEntryV2 = z.infer<
  typeof ReputationLedgerEntryV2Schema
>;

export const PlayerTrustProjectionV2Schema = z
  .object({
    completedSessions: z.number().int().nonnegative(),
    completionReliabilityBps: z.number().int().min(0).max(10_000),
    confirmedModerationActions: z.number().int().nonnegative(),
    noShowCount: z.number().int().nonnegative(),
    playerId: PlayerIdSchema,
    positiveEndorsements: z.number().int().nonnegative(),
    projectionVersion: z.number().int().nonnegative(),
    repeatTeammateCount: z.number().int().nonnegative(),
    rebuiltAt: z.string().datetime({ offset: true }).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type PlayerTrustProjectionV2 = z.infer<
  typeof PlayerTrustProjectionV2Schema
>;
