import { z } from 'zod';

import {
  ConversationIdSchema,
  CorrelationIdSchema,
  IdempotencyKeySchema,
  MatchIdSchema,
  PlayerIdSchema,
} from '../identity/semantic-ids';

export type MessageId = string & { readonly __brand: 'MessageId' };
export type MediaAssetId = string & { readonly __brand: 'MediaAssetId' };

export const MessageIdSchema = z
  .string()
  .uuid()
  .transform((value) => value as MessageId);
export const MediaAssetIdSchema = z
  .string()
  .uuid()
  .transform((value) => value as MediaAssetId);

export const ConversationStateV1Schema = z.enum(['open', 'archived', 'closed']);

export const MessageContentV1Schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    text: z.string().trim().min(1).max(4000),
  }),
  z.object({
    kind: z.literal('media'),
    assetId: MediaAssetIdSchema,
    caption: z.string().trim().min(1).max(4000).optional(),
  }),
  z.object({
    kind: z.literal('system'),
    eventType: z.string().trim().min(1).max(120),
  }),
]);

export const MessageSummaryV1Schema = z.object({
  messageId: MessageIdSchema,
  senderPlayerId: PlayerIdSchema,
  sequence: z.number().int().positive(),
  kind: z.enum(['text', 'media', 'system']),
  preview: z.string().max(240),
  createdAt: z.string().datetime({ offset: true }),
});

export const ConversationSnapshotV1Schema = z.object({
  conversationId: ConversationIdSchema,
  matchId: MatchIdSchema,
  participantIds: z
    .tuple([PlayerIdSchema, PlayerIdSchema])
    .refine(([left, right]) => left !== right, 'participants must be distinct'),
  state: ConversationStateV1Schema,
  lastMessage: MessageSummaryV1Schema.nullable(),
  unreadCount: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});

export const MessageV1Schema = z.object({
  messageId: MessageIdSchema,
  conversationId: ConversationIdSchema,
  senderPlayerId: PlayerIdSchema,
  clientMessageId: IdempotencyKeySchema,
  sequence: z.number().int().positive(),
  content: MessageContentV1Schema,
  createdAt: z.string().datetime({ offset: true }),
});

export const ReadStateV1Schema = z.object({
  conversationId: ConversationIdSchema,
  playerId: PlayerIdSchema,
  lastReadSequence: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime({ offset: true }),
});

export const SendMessageCommandV1Schema = z.object({
  conversationId: ConversationIdSchema,
  clientMessageId: IdempotencyKeySchema,
  content: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('text'),
      text: z.string().trim().min(1).max(4000),
    }),
    z.object({
      kind: z.literal('media'),
      assetId: MediaAssetIdSchema,
      caption: z.string().trim().min(1).max(4000).optional(),
    }),
  ]),
  clientCreatedAt: z.string().datetime({ offset: true }),
  correlationId: CorrelationIdSchema,
});

export const AdvanceReadCommandV1Schema = z.object({
  conversationId: ConversationIdSchema,
  lastReadSequence: z.number().int().nonnegative(),
  correlationId: CorrelationIdSchema,
});

export type ConversationStateV1 = z.infer<typeof ConversationStateV1Schema>;
export type MessageContentV1 = z.infer<typeof MessageContentV1Schema>;
export type MessageSummaryV1 = z.infer<typeof MessageSummaryV1Schema>;
export type ConversationSnapshotV1 = z.infer<
  typeof ConversationSnapshotV1Schema
>;
export type MessageV1 = z.infer<typeof MessageV1Schema>;
export type ReadStateV1 = z.infer<typeof ReadStateV1Schema>;
export type SendMessageCommandV1 = z.infer<typeof SendMessageCommandV1Schema>;
export type AdvanceReadCommandV1 = z.infer<typeof AdvanceReadCommandV1Schema>;
