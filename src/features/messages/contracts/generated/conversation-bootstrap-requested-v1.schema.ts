/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */
/* eslint-disable eqeqeq -- json-schema-to-zod emits loose equality for uniqueItems. */
import { z } from 'zod';

export const ConversationBootstrapRequestedV1Schema = z
  .object({
    /**Globally unique event identifier.*/
    eventId: z
      .string()
      .min(1)
      .max(128)
      .describe('Globally unique event identifier.'),
    eventType: z.literal('conversation.bootstrap_requested.v1'),
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
        /**Authoritative MatchId supplied by Mission 2.*/
        matchId: z
          .string()
          .min(1)
          .max(128)
          .describe('Authoritative MatchId supplied by Mission 2.'),
        participantIds: z
          .array(
            z
              .string()
              .min(1)
              .max(128)
              .describe('PlayerId supplied by Mission 2.'),
          )
          .min(2)
          .max(2)
          .refine(
            (arr) => arr.every((item, i) => arr.indexOf(item) == i),
            'All items must be unique!',
          ),
        /**Stable bootstrap idempotency key for this match.*/
        idempotencyKey: z
          .string()
          .min(1)
          .max(128)
          .describe('Stable bootstrap idempotency key for this match.'),
      })
      .strict(),
  })
  .strict();
export type ConversationBootstrapRequestedV1 = z.infer<
  typeof ConversationBootstrapRequestedV1Schema
>;
