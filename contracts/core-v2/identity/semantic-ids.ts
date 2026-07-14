import { z } from 'zod';

export {
  CorrelationIdSchema,
  EventIdSchema,
  IdempotencyKeySchema,
  PlayerIdSchema,
  type CorrelationId,
  type EventId,
  type IdempotencyKey,
  type PlayerId,
} from '../../core-v1/identity/semantic-ids';

export const PlaySessionIdSchema = z.string().uuid().brand<'PlaySessionId'>();
export type PlaySessionId = z.infer<typeof PlaySessionIdSchema>;

export const SessionOutcomeIdSchema = z
  .string()
  .uuid()
  .brand<'SessionOutcomeId'>();
export type SessionOutcomeId = z.infer<typeof SessionOutcomeIdSchema>;

export const ParticipationConfirmationIdSchema = z
  .string()
  .uuid()
  .brand<'ParticipationConfirmationId'>();
export type ParticipationConfirmationId = z.infer<
  typeof ParticipationConfirmationIdSchema
>;

export const PlayerEndorsementIdSchema = z
  .string()
  .uuid()
  .brand<'PlayerEndorsementId'>();
export type PlayerEndorsementId = z.infer<typeof PlayerEndorsementIdSchema>;

export const ReputationLedgerEntryIdSchema = z
  .string()
  .uuid()
  .brand<'ReputationLedgerEntryId'>();
export type ReputationLedgerEntryId = z.infer<
  typeof ReputationLedgerEntryIdSchema
>;

export const ActivityItemIdSchema = z.string().uuid().brand<'ActivityItemId'>();
export type ActivityItemId = z.infer<typeof ActivityItemIdSchema>;

export const RepeatTeammateRelationshipIdSchema = z
  .string()
  .uuid()
  .brand<'RepeatTeammateRelationshipId'>();
export type RepeatTeammateRelationshipId = z.infer<
  typeof RepeatTeammateRelationshipIdSchema
>;

export const RepeatPlayRequestIdSchema = z
  .string()
  .uuid()
  .brand<'RepeatPlayRequestId'>();
export type RepeatPlayRequestId = z.infer<typeof RepeatPlayRequestIdSchema>;
