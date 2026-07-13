/* AUTO-GENERATED from contracts/core-v1. DO NOT EDIT. */
import { z } from 'zod';

/**Authenticated command to append one text or media message.*/
export const SendMessageCommandV1Schema = z
  .object({
    /**ConversationId.*/
    conversationId: z.string().min(1).max(128).describe('ConversationId.'),
    /**Stable idempotency identifier reused for retries.*/
    clientMessageId: z
      .string()
      .min(1)
      .max(128)
      .describe('Stable idempotency identifier reused for retries.'),
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
                  'Invalid input: Should pass single schema. Passed ' + passed,
              }
            : {
                path: [],
                code: 'custom',
                errors: [errors],
                message:
                  'Invalid input: Should pass single schema. Passed ' + passed,
              },
        );
      }
    }),
    /**Client observation time; never used for canonical ordering.*/
    clientCreatedAt: z
      .string()
      .datetime({ offset: true })
      .describe('Client observation time; never used for canonical ordering.'),
    /**Cross-mission correlation identifier.*/
    correlationId: z
      .string()
      .min(1)
      .max(128)
      .describe('Cross-mission correlation identifier.'),
  })
  .strict()
  .describe('Authenticated command to append one text or media message.');
export type SendMessageCommandV1 = z.infer<typeof SendMessageCommandV1Schema>;
