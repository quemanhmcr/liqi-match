/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */
import { z } from 'zod';

export const ConversationReadAdvancedV1Schema = z
  .object({
    /**Globally unique event identifier.*/
    eventId: z
      .string()
      .min(1)
      .max(128)
      .describe('Globally unique event identifier.'),
    eventType: z.literal('conversation.read_advanced.v1'),
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
        readState: z
          .object({
            /**ConversationId.*/
            conversationId: z
              .string()
              .min(1)
              .max(128)
              .describe('ConversationId.'),
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
          .strict(),
      })
      .strict(),
  })
  .strict();
export type ConversationReadAdvancedV1 = z.infer<
  typeof ConversationReadAdvancedV1Schema
>;
