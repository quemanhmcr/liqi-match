/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */
/* eslint-disable eqeqeq -- json-schema-to-zod emits loose equality for uniqueItems. */
import { z } from 'zod';

export const MessageSentV1Schema = z
  .object({
    /**Globally unique event identifier.*/
    eventId: z
      .string()
      .min(1)
      .max(128)
      .describe('Globally unique event identifier.'),
    eventType: z.literal('message.sent.v1'),
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
        message: z
          .object({
            /**MessageId.*/
            messageId: z.string().min(1).max(128).describe('MessageId.'),
            /**ConversationId.*/
            conversationId: z
              .string()
              .min(1)
              .max(128)
              .describe('ConversationId.'),
            /**PlayerId.*/
            senderPlayerId: z.string().min(1).max(128).describe('PlayerId.'),
            /**Client-generated idempotency identifier scoped to sender and conversation.*/
            clientMessageId: z
              .string()
              .min(1)
              .max(128)
              .describe(
                'Client-generated idempotency identifier scoped to sender and conversation.',
              ),
            sequence: z.number().int().gte(1),
            content: z.any().superRefine((x, ctx) => {
              const schemas = [
                z
                  .object({
                    kind: z.literal('text'),
                    text: z.string().min(1).max(4000),
                  })
                  .strict(),
                z
                  .object({
                    kind: z.literal('media'),
                    /**Authoritative media asset identifier.*/
                    assetId: z
                      .string()
                      .min(1)
                      .max(128)
                      .describe('Authoritative media asset identifier.'),
                    caption: z.string().min(1).max(4000).optional(),
                  })
                  .strict(),
                z
                  .object({
                    kind: z.literal('system'),
                    eventType: z.string().min(1).max(120),
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
            /**Authoritative server creation time.*/
            createdAt: z
              .string()
              .datetime({ offset: true })
              .describe('Authoritative server creation time.'),
          })
          .strict(),
        recipientPlayerIds: z
          .array(z.string().min(1).max(128).describe('PlayerId.'))
          .min(1)
          .refine(
            (arr) => arr.every((item, i) => arr.indexOf(item) == i),
            'All items must be unique!',
          ),
      })
      .strict(),
  })
  .strict();
export type MessageSentV1 = z.infer<typeof MessageSentV1Schema>;
