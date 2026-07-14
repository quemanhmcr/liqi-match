import { z } from 'zod';
import { IdempotencyKeySchema, PlayerIdSchema } from '../identity/semantic-ids';
import { PlayerSummaryV1Schema } from '../profile/player-summary';

export const RelationshipStateV1Schema = z.enum([
  'none',
  'liked',
  'passed',
  'matched',
  'blocked',
]);

export const DiscoveryCandidateV1Schema = z.object({
  playerId: PlayerIdSchema,
  profileSummary: PlayerSummaryV1Schema,
  relationshipState: z.enum(['none', 'liked', 'passed']),
  capabilities: z.object({
    canLike: z.boolean(),
    canPass: z.boolean(),
    canInvite: z.boolean(),
  }),
  recommendationContext: z.object({
    reasonCodes: z.array(z.string().min(1)).max(20),
    score: z.number().int().min(0).max(100).optional(),
  }),
});

export const DiscoveryCursorV1Schema = z.object({
  snapshotId: z.string().uuid(),
  score: z.number().finite(),
  playerId: PlayerIdSchema,
});

export const DiscoveryCandidateQueryV1Schema = z.object({
  cursor: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const DiscoveryCandidatePageV1Schema = z.object({
  items: z.array(DiscoveryCandidateV1Schema),
  nextCursor: z.string().uuid().nullable(),
  snapshot: z.object({
    snapshotId: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    intentVersion: z.number().int().positive(),
  }),
});

export const PlayerDecisionCommandV1Schema = z.object({
  targetPlayerId: PlayerIdSchema,
  decision: z.enum(['like', 'pass']),
  idempotencyKey: IdempotencyKeySchema,
  correlationId: z.string().uuid(),
  expectedIntentVersion: z.number().int().positive(),
  expectedTargetProfileVersion: z.number().int().nonnegative(),
});

export type RelationshipStateV1 = z.infer<typeof RelationshipStateV1Schema>;
export type DiscoveryCandidateV1 = z.infer<typeof DiscoveryCandidateV1Schema>;
export type DiscoveryCandidateQueryV1 = z.infer<
  typeof DiscoveryCandidateQueryV1Schema
>;
export type DiscoveryCandidatePageV1 = z.infer<
  typeof DiscoveryCandidatePageV1Schema
>;
export type PlayerDecisionCommandV1 = z.infer<
  typeof PlayerDecisionCommandV1Schema
>;
