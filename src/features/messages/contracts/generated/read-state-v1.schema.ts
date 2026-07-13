/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */
import { z } from 'zod';

/**Authoritative per-participant read watermark and derived unread count.*/
export const ReadStateV1Schema = z
  .object({
    /**ConversationId.*/
    conversationId: z.string().min(1).max(128).describe('ConversationId.'),
    /**PlayerId.*/
    playerId: z.string().min(1).max(128).describe('PlayerId.'),
    lastReadSequence: z.number().int().gte(0),
    unreadCount: z.number().int().gte(0),
    /**Authoritative server update time.*/
    updatedAt: z
      .string()
      .datetime({ offset: true })
      .describe('Authoritative server update time.'),
  })
  .strict()
  .describe(
    'Authoritative per-participant read watermark and derived unread count.',
  );
export type ReadStateV1 = z.infer<typeof ReadStateV1Schema>;
