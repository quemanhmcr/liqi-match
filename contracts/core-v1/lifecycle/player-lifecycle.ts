import { z } from 'zod';
import {
  AccountIdSchema,
  PlayerIdSchema,
  ProfileIdSchema,
} from '../identity/semantic-ids';

export const PlayerLifecycleStateV1Schema = z.enum([
  'registered',
  'onboarding',
  'active',
  'suspended',
  'deleting',
  'deleted',
]);

export const PlayerLifecycleSnapshotV1Schema = z.object({
  accountId: AccountIdSchema,
  playerId: PlayerIdSchema,
  profileId: ProfileIdSchema,
  state: PlayerLifecycleStateV1Schema,
  discoverable: z.boolean(),
  profileVersion: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true }),
});

export type PlayerLifecycleSnapshotV1 = z.infer<
  typeof PlayerLifecycleSnapshotV1Schema
>;
