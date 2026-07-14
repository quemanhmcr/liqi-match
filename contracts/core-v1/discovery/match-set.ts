import { z } from 'zod';

import { HomeMatchKindV1Schema } from '../match/home-match-facts';
import {
  IdempotencyKeySchema,
  MatchSetIdSchema,
  PlayerIdSchema,
  SetInviteIdSchema,
  SetJoinRequestIdSchema,
} from '../identity/semantic-ids';

export const MatchSetStateV1Schema = z.enum(['open', 'full', 'closed']);

export const MatchSetSnapshotV1Schema = z.object({
  capacity: z.number().int().min(2).max(5),
  createdAt: z.string().datetime({ offset: true }),
  intentKind: HomeMatchKindV1Schema,
  memberPlayerIds: z.array(PlayerIdSchema).min(1).max(5),
  ownerPlayerId: PlayerIdSchema,
  setId: MatchSetIdSchema,
  state: MatchSetStateV1Schema,
  title: z.string().trim().min(1).max(80),
  version: z.number().int().positive(),
});

export const SetDiscoveryCandidateV1Schema = z.object({
  capabilities: z.object({
    canInvite: z.boolean(),
    canRequestJoin: z.boolean(),
  }),
  recommendationContext: z.object({
    reasonCodes: z.array(z.string().min(1)).max(20),
  }),
  set: MatchSetSnapshotV1Schema,
});

export const SetDiscoveryQueryV1Schema = z.object({
  cursor: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const SetDiscoveryPageV1Schema = z.object({
  items: z.array(SetDiscoveryCandidateV1Schema),
  nextCursor: z.string().uuid().nullable(),
  snapshot: z.object({
    createdAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    intentVersion: z.number().int().positive(),
    snapshotId: z.string().uuid(),
  }),
});

export const CreateSetInviteCommandV1Schema = z.object({
  correlationId: z.string().uuid(),
  expectedSetVersion: z.number().int().positive(),
  idempotencyKey: IdempotencyKeySchema,
  setId: MatchSetIdSchema,
  targetPlayerId: PlayerIdSchema,
});

export const SetInviteReceiptV1Schema = z.object({
  inviteId: SetInviteIdSchema,
  repeated: z.boolean(),
  state: z.literal('pending'),
});

export const RequestSetJoinCommandV1Schema = z.object({
  correlationId: z.string().uuid(),
  expectedSetVersion: z.number().int().positive(),
  idempotencyKey: IdempotencyKeySchema,
  setId: MatchSetIdSchema,
});

export const SetJoinRequestReceiptV1Schema = z.object({
  joinRequestId: SetJoinRequestIdSchema,
  repeated: z.boolean(),
  state: z.literal('pending'),
});

export type CreateSetInviteCommandV1 = z.infer<
  typeof CreateSetInviteCommandV1Schema
>;
export type MatchSetSnapshotV1 = z.infer<typeof MatchSetSnapshotV1Schema>;
export type RequestSetJoinCommandV1 = z.infer<
  typeof RequestSetJoinCommandV1Schema
>;
export type SetDiscoveryCandidateV1 = z.infer<
  typeof SetDiscoveryCandidateV1Schema
>;
export type SetDiscoveryPageV1 = z.infer<typeof SetDiscoveryPageV1Schema>;
export type SetInviteReceiptV1 = z.infer<typeof SetInviteReceiptV1Schema>;
export type SetJoinRequestReceiptV1 = z.infer<
  typeof SetJoinRequestReceiptV1Schema
>;
