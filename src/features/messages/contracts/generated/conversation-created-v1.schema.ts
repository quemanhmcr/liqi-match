/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */
/* eslint-disable eqeqeq -- json-schema-to-zod emits loose equality for uniqueItems. */
import { z } from 'zod';

export const ConversationCreatedV1Schema = z
  .object({
    /**Globally unique event identifier.*/
    eventId: z
      .string()
      .min(1)
      .max(128)
      .describe('Globally unique event identifier.'),
    eventType: z.literal('conversation.created.v1'),
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
        conversation: z
          .object({
            /**ConversationId.*/
            conversationId: z
              .string()
              .min(1)
              .max(128)
              .describe('ConversationId.'),
            /**Authoritative MatchId.*/
            matchId: z
              .string()
              .min(1)
              .max(128)
              .describe('Authoritative MatchId.'),
            participantIds: z
              .array(z.string().min(1).max(128).describe('PlayerId.'))
              .min(2)
              .max(2)
              .refine(
                (arr) => arr.every((item, i) => arr.indexOf(item) == i),
                'All items must be unique!',
              ),
            state: z.enum(['open', 'archived', 'closed']),
            lastMessage: z.any().superRefine((x, ctx) => {
              const schemas = [
                z.null(),
                z
                  .object({
                    /**MessageId.*/
                    messageId: z
                      .string()
                      .min(1)
                      .max(128)
                      .describe('MessageId.'),
                    /**PlayerId.*/
                    senderPlayerId: z
                      .string()
                      .min(1)
                      .max(128)
                      .describe('PlayerId.'),
                    sequence: z.number().int().gte(1),
                    kind: z.enum(['text', 'media', 'system']),
                    preview: z.string().max(240),
                    /**Authoritative server creation time.*/
                    createdAt: z
                      .string()
                      .datetime({ offset: true })
                      .describe('Authoritative server creation time.'),
                  })
                  .strict(),
              ];
              const { errors, failed } = schemas.reduce<{
                errors: z.core.$ZodIssue[];
                failed: number;
              }>(
                ({ errors, failed }, schema) =>
                  ((result) =>
                    result.error
                      ? {
                          errors: [...errors, ...result.error.issues],
                          failed: failed + 1,
                        }
                      : { errors, failed })(schema.safeParse(x)),
                { errors: [], failed: 0 },
              );
              const passed = schemas.length - failed;
              if (passed !== 1) {
                ctx.addIssue(
                  errors.length
                    ? {
                        path: [],
                        code: 'invalid_union',
                        errors: [errors],
                        message:
                          'Invalid input: Should pass single schema. Passed ' +
                          passed,
                      }
                    : {
                        path: [],
                        code: 'custom',
                        errors: [errors],
                        message:
                          'Invalid input: Should pass single schema. Passed ' +
                          passed,
                      },
                );
              }
            }),
            unreadCount: z.number().int().gte(0),
            version: z.number().int().gte(1),
          })
          .strict(),
        /**Bootstrap idempotency key accepted by the provider.*/
        idempotencyKey: z
          .string()
          .min(1)
          .max(128)
          .describe('Bootstrap idempotency key accepted by the provider.'),
      })
      .strict(),
  })
  .strict();
export type ConversationCreatedV1 = z.infer<typeof ConversationCreatedV1Schema>;
