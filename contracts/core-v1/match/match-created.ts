import { z } from 'zod';
import {
  CorrelationIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
} from '../identity/semantic-ids';

export const MatchSourceV1Schema = z.enum([
  'mutual_like',
  'set_join',
  'invite_accept',
]);

export const MatchCreatedV1Schema = z.object({
  matchId: MatchIdSchema,
  participantIds: z
    .tuple([PlayerIdSchema, PlayerIdSchema])
    .refine(([left, right]) => left !== right, 'participants must be distinct'),
  source: MatchSourceV1Schema,
  createdAt: z.string().datetime({ offset: true }),
  correlationId: CorrelationIdSchema,
});

export const PlayerDecisionReceiptV1Schema = z.object({
  relationshipState: z.enum(['liked', 'passed', 'matched']),
  match: MatchCreatedV1Schema.nullable(),
  repeated: z.boolean(),
});

export type MatchCreatedV1 = z.infer<typeof MatchCreatedV1Schema>;
export type PlayerDecisionReceiptV1 = z.infer<
  typeof PlayerDecisionReceiptV1Schema
>;
