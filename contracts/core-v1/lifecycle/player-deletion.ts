import { z } from 'zod';
import { AuthenticatedPrincipalV1Schema } from '../identity/authenticated-principal';
import { IdempotencyKeySchema } from '../identity/semantic-ids';
import { PlayerLifecycleSnapshotV1Schema } from './player-lifecycle';

export const RequestPlayerDeletionCommandV1Schema = z
  .object({
    confirmation: z.literal('DELETE'),
    expectedLifecycleVersion: z.number().int().positive(),
    idempotencyKey: IdempotencyKeySchema,
  })
  .strict();

export const RequestPlayerDeletionResultV1Schema = z
  .object({
    principal: AuthenticatedPrincipalV1Schema,
    lifecycle: PlayerLifecycleSnapshotV1Schema,
    repeated: z.boolean(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.lifecycle.state !== 'deleting') {
      context.addIssue({
        code: 'custom',
        message: 'Deletion requests must return lifecycle state deleting.',
        path: ['lifecycle', 'state'],
      });
    }
    if (result.principal.playerId !== result.lifecycle.playerId) {
      context.addIssue({
        code: 'custom',
        message: 'Principal and lifecycle must reference the same PlayerId.',
        path: ['principal', 'playerId'],
      });
    }
  });

export type RequestPlayerDeletionCommandV1 = z.infer<
  typeof RequestPlayerDeletionCommandV1Schema
>;
export type RequestPlayerDeletionResultV1 = z.infer<
  typeof RequestPlayerDeletionResultV1Schema
>;
