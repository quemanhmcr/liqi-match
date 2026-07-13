/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */
import { z } from 'zod';

export const ConversationClosedV1Schema = z
  .object({
    /**Globally unique event identifier.*/
    eventId: z
      .string()
      .min(1)
      .max(128)
      .describe('Globally unique event identifier.'),
    eventType: z.literal('conversation.closed.v1'),
    /**UTC event time.*/
    occurredAt: z
      .string()
      .datetime({ offset: true })
      .describe('UTC event time.'),
    /**Cross-mission correlation identifier.*/
    correlationId: z
      .string()
      .min(1)
      .max(128)
      .describe('Cross-mission correlation identifier.'),
    /**Identifier of the command or event that caused this event.*/
    causationId: z
      .string()
      .min(1)
      .max(128)
      .describe('Identifier of the command or event that caused this event.')
      .optional(),
    payload: z
      .object({
        /**ConversationId.*/
        conversationId: z.string().min(1).max(128).describe('ConversationId.'),
        /**MatchId.*/
        matchId: z.string().min(1).max(128).describe('MatchId.'),
        reason: z.enum(['unmatched', 'blocked', 'retention', 'administrative']),
        /**Authoritative close time.*/
        closedAt: z
          .string()
          .datetime({ offset: true })
          .describe('Authoritative close time.'),
        version: z.number().int().gte(1),
      })
      .strict(),
  })
  .strict();
export type ConversationClosedV1 = z.infer<typeof ConversationClosedV1Schema>;
