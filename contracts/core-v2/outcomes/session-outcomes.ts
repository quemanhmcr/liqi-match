import { z } from 'zod';

import {
  CoreV2MutationCommandMetadataSchema,
  CoreV2ReceiptBaseSchema,
} from '../commands/command';
import {
  EventIdSchema,
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
        message: 'participantPlayerIds must be unique.',
      });
    }
  });

const EventfulReceiptBaseV2Schema = CoreV2ReceiptBaseSchema.extend({
  eventIds: z.array(EventIdSchema).min(1).max(20),
});

export const SessionOutcomeStateV2Schema = z.enum(['recorded', 'disputed']);
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
    participantPlayerIds: uniquePlayerIds,
    outcomeId: SessionOutcomeIdSchema,
    sessionId: PlaySessionIdSchema,
    scheduledFor: z.string().datetime({ offset: true }).nullable(),
    sourceSessionVersion: z.number().int().positive(),
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

const feedbackPlayerIds = z
  .array(PlayerIdSchema)
  .max(10)
  .superRefine((ids, ctx) => {
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Feedback player IDs must be unique.',
      });
    }
  });

export const SessionFeedbackSurfaceV2Schema = z
  .object({
    actorConfirmation: ParticipationConfirmationV2Schema.nullable(),
    actorPlayerId: PlayerIdSchema,
    allParticipantsConfirmed: z.boolean(),
    confirmedPlayerIds: feedbackPlayerIds,
    endorsementTargetPlayerIds: feedbackPlayerIds,
    outcome: SessionOutcomeSnapshotV2Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const participants = new Set(value.outcome.participantPlayerIds);
    if (!participants.has(value.actorPlayerId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Feedback actor must be a session participant.',
        path: ['actorPlayerId'],
      });
    }
    if (
      value.actorConfirmation &&
      value.actorConfirmation.playerId !== value.actorPlayerId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Actor confirmation must belong to the feedback actor.',
        path: ['actorConfirmation'],
      });
    }
    for (const playerId of value.confirmedPlayerIds) {
      if (!participants.has(playerId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Confirmed players must be session participants.',
          path: ['confirmedPlayerIds'],
        });
      }
    }
    for (const playerId of value.endorsementTargetPlayerIds) {
      if (
        playerId === value.actorPlayerId ||
        !value.confirmedPlayerIds.includes(playerId)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Endorsement targets must be confirmed teammates.',
          path: ['endorsementTargetPlayerIds'],
        });
      }
    }
    if (
      value.allParticipantsConfirmed !==
      value.outcome.participantPlayerIds.every((playerId) =>
        value.confirmedPlayerIds.includes(playerId),
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'allParticipantsConfirmed must match confirmedPlayerIds.',
        path: ['allParticipantsConfirmed'],
      });
    }
  });
export type SessionFeedbackSurfaceV2 = z.infer<
  typeof SessionFeedbackSurfaceV2Schema
>;

export const ConfirmSessionParticipationCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    sessionId: PlaySessionIdSchema,
  }).strict();
export type ConfirmSessionParticipationCommandV2 = z.infer<
  typeof ConfirmSessionParticipationCommandV2Schema
>;

export const DisputeSessionParticipationCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    note: z.string().trim().min(1).max(500).optional(),
    reasonCode: ParticipationDisputeReasonV2Schema,
    sessionId: PlaySessionIdSchema,
  }).strict();
export type DisputeSessionParticipationCommandV2 = z.infer<
  typeof DisputeSessionParticipationCommandV2Schema
>;

export const ParticipationCommandNameV2Schema = z.enum([
  'confirm_session_participation_v2',
  'dispute_session_participation_v2',
]);

export const ParticipationCommandReceiptV2Schema =
  EventfulReceiptBaseV2Schema.extend({
    aggregateType: z.literal('session_outcome'),
    commandName: ParticipationCommandNameV2Schema,
    confirmation: ParticipationConfirmationV2Schema,
    outcome: SessionOutcomeSnapshotV2Schema,
    resultCode: z.enum(['participation_confirmed', 'participation_disputed']),
  }).strict();
export type ParticipationCommandReceiptV2 = z.infer<
  typeof ParticipationCommandReceiptV2Schema
>;
