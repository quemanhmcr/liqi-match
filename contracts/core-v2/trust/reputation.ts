import { z } from 'zod';

import {
  CoreV2CreateCommandMetadataSchema,
  CoreV2MutationCommandMetadataSchema,
  CoreV2ReceiptBaseSchema,
} from '../commands/command';
import {
  EventIdSchema,
  PlayerEndorsementIdSchema,
  PlayerIdSchema,
  ReputationLedgerEntryIdSchema,
  PlaySessionIdSchema,
} from '../identity/semantic-ids';

const EventfulReceiptBaseV2Schema = CoreV2ReceiptBaseSchema.extend({
  eventIds: z.array(EventIdSchema).min(1).max(20),
});

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

export const SubmitPlayerEndorsementCommandV2Schema =
  CoreV2CreateCommandMetadataSchema.extend({
    expectedOutcomeVersion: z.number().int().positive(),
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

export const SubmitPlayerEndorsementReceiptV2Schema =
  EventfulReceiptBaseV2Schema.extend({
    aggregateType: z.literal('player_endorsement'),
    commandName: z.literal('submit_player_endorsement_v2'),
    endorsement: PlayerEndorsementV2Schema,
    resultCode: z.literal('endorsement_submitted'),
  }).strict();
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

export const RebuildReputationProjectionCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    playerId: PlayerIdSchema,
  }).strict();
export type RebuildReputationProjectionCommandV2 = z.infer<
  typeof RebuildReputationProjectionCommandV2Schema
>;

export const RebuildReputationProjectionReceiptV2Schema =
  EventfulReceiptBaseV2Schema.extend({
    aggregateType: z.literal('player_reputation_projection'),
    commandName: z.literal('rebuild_reputation_projection_v2'),
    projection: PlayerTrustProjectionV2Schema,
    resultCode: z.literal('projection_rebuilt'),
  }).strict();
export type RebuildReputationProjectionReceiptV2 = z.infer<
  typeof RebuildReputationProjectionReceiptV2Schema
>;
