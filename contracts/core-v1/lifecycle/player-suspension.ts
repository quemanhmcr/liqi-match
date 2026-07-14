import { z } from 'zod';
import { IdempotencyKeySchema, PlayerIdSchema } from '../identity/semantic-ids';
import { PlayerLifecycleSnapshotV1Schema } from './player-lifecycle';

export const PlayerSuspensionReasonCodeV1Schema = z
  .string()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9._:-]+$/);

export const SuspendPlayerCommandV1Schema = z
  .object({
    expectedLifecycleVersion: z.number().int().positive(),
    idempotencyKey: IdempotencyKeySchema,
    playerId: PlayerIdSchema,
    reasonCode: PlayerSuspensionReasonCodeV1Schema,
  })
  .strict();

export const SuspendPlayerResultV1Schema = z
  .object({
    lifecycle: PlayerLifecycleSnapshotV1Schema,
    reasonCode: PlayerSuspensionReasonCodeV1Schema,
    repeated: z.boolean(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.lifecycle.state !== 'suspended') {
      context.addIssue({
        code: 'custom',
        message: 'Suspension commands must return lifecycle state suspended.',
        path: ['lifecycle', 'state'],
      });
    }
  });

export const ResumePlayerCommandV1Schema = z
  .object({
    expectedLifecycleVersion: z.number().int().positive(),
    idempotencyKey: IdempotencyKeySchema,
    playerId: PlayerIdSchema,
  })
  .strict();

export const ResumePlayerResultV1Schema = z
  .object({
    lifecycle: PlayerLifecycleSnapshotV1Schema,
    repeated: z.boolean(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.lifecycle.state !== 'active') {
      context.addIssue({
        code: 'custom',
        message: 'Resume commands must return lifecycle state active.',
        path: ['lifecycle', 'state'],
      });
    }
  });

export type PlayerSuspensionReasonCodeV1 = z.infer<
  typeof PlayerSuspensionReasonCodeV1Schema
>;
export type ResumePlayerCommandV1 = z.infer<typeof ResumePlayerCommandV1Schema>;
export type ResumePlayerResultV1 = z.infer<typeof ResumePlayerResultV1Schema>;
export type SuspendPlayerCommandV1 = z.infer<
  typeof SuspendPlayerCommandV1Schema
>;
export type SuspendPlayerResultV1 = z.infer<typeof SuspendPlayerResultV1Schema>;
