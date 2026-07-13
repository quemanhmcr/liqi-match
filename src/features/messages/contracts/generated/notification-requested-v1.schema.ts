/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */
import { z } from 'zod';

export const NotificationRequestedV1Schema = z
  .object({
    /**Globally unique event identifier.*/
    eventId: z
      .string()
      .min(1)
      .max(128)
      .describe('Globally unique event identifier.'),
    eventType: z.literal('notification.requested.v1'),
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
        reason: z.literal('message_received'),
        /**PlayerId that should receive attention.*/
        recipientPlayerId: z
          .string()
          .min(1)
          .max(128)
          .describe('PlayerId that should receive attention.'),
        /**ConversationId deep-link target.*/
        conversationId: z
          .string()
          .min(1)
          .max(128)
          .describe('ConversationId deep-link target.'),
        /**MessageId that triggered attention.*/
        messageId: z
          .string()
          .min(1)
          .max(128)
          .describe('MessageId that triggered attention.'),
        /**PlayerId that sent the message.*/
        senderPlayerId: z
          .string()
          .min(1)
          .max(128)
          .describe('PlayerId that sent the message.'),
        authoritativeUnreadCount: z.number().int().gte(1),
        foregroundPolicy: z.enum(['suppress_push', 'allow_push']),
      })
      .strict(),
  })
  .strict();
export type NotificationRequestedV1 = z.infer<
  typeof NotificationRequestedV1Schema
>;
