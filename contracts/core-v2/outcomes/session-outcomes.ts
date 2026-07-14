import { z } from 'zod';

import {
  CorrelationIdSchema,
  IdempotencyKeySchema,
  ParticipationConfirmationIdSchema,
  PlayerIdSchema,
  PlaySessionIdSchema,
  SessionOutcomeIdSchema,
} from '../identity/semantic-ids';

const uniquePlayerIds = z
  .array(PlayerIdSchema)
  .min(2)
  .max(10)
  .superRefine((ids, ctx) => {
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'memberPlayerIds must be unique.',
      });
    }
  });

export const SessionOutcomeStateV2Schema = z.enum([
  'awaiting_confirmation',
  'confirmed',
  'disputed',
]);
export type SessionOutcomeStateV2 = z.infer<typeof SessionOutcomeStateV2Schema>;

export const ParticipationConfirmationStatusV2Schema = z.enum([
  'confirmed',
  'disputed',
]);
export type ParticipationConfirmationStatusV2 = z.infer<
  typeof ParticipationConfirmationStatusV2Schema
>;

export const ParticipationDisputeReasonV2Schema = z.enum([
  'session_did_not_happen',
  'left_before_start',
  'wrong_member_list',
  'other',
]);
export type ParticipationDisputeReasonV2 = z.infer<
  typeof ParticipationDisputeReasonV2Schema
>;

export const SessionOutcomeSnapshotV2Schema = z
  .object({
    completedAt: z.string().datetime({ offset: true }),
    confirmationDeadlineAt: z.string().datetime({ offset: true }),
    memberPlayerIds: uniquePlayerIds,
    outcomeId: SessionOutcomeIdSchema,
    sessionId: PlaySessionIdSchema,
    sessionVersion: z.number().int().positive(),
    startedAt: z.string().datetime({ offset: true }),
    state: SessionOutcomeStateV2Schema,
    version: z.number().int().positive(),
  })
  .strict();
export type SessionOutcomeSnapshotV2 = z.infer<
  typeof SessionOutcomeSnapshotV2Schema
>;

export const ParticipationConfirmationV2Schema = z
  .object({
    confirmationId: ParticipationConfirmationIdSchema,
    confirmedAt: z.string().datetime({ offset: true }),
    playerId: PlayerIdSchema,
    reasonCode: ParticipationDisputeReasonV2Schema.nullable(),
    sessionId: PlaySessionIdSchema,
    status: ParticipationConfirmationStatusV2Schema,
    version: z.number().int().positive(),
  })
  .strict();
export type ParticipationConfirmationV2 = z.infer<
  typeof ParticipationConfirmationV2Schema
>;

const mutationBase = {
  correlationId: CorrelationIdSchema,
  expectedAggregateVersion: z.number().int().positive(),
  idempotencyKey: IdempotencyKeySchema,
  sessionId: PlaySessionIdSchema,
};

export const ConfirmSessionParticipationCommandV2Schema = z
  .object(mutationBase)
  .strict();
export type ConfirmSessionParticipationCommandV2 = z.infer<
  typeof ConfirmSessionParticipationCommandV2Schema
>;

export const DisputeSessionParticipationCommandV2Schema = z
  .object({
    ...mutationBase,
    note: z.string().trim().min(1).max(500).optional(),
    reasonCode: ParticipationDisputeReasonV2Schema,
  })
  .strict();
export type DisputeSessionParticipationCommandV2 = z.infer<
  typeof DisputeSessionParticipationCommandV2Schema
>;

export const ParticipationCommandReceiptV2Schema = z
  .object({
    confirmation: ParticipationConfirmationV2Schema,
    correlationId: CorrelationIdSchema,
    outcome: SessionOutcomeSnapshotV2Schema,
    repeated: z.boolean(),
  })
  .strict();
export type ParticipationCommandReceiptV2 = z.infer<
  typeof ParticipationCommandReceiptV2Schema
>;
