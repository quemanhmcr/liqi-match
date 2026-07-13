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

export const PlayerLifecycleSnapshotV1Schema = z
  .object({
    accountId: AccountIdSchema,
    playerId: PlayerIdSchema,
    profileId: ProfileIdSchema,
    state: PlayerLifecycleStateV1Schema,
    discoverable: z.boolean(),
    messagingAllowed: z.boolean(),
    profileVersion: z.number().int().nonnegative(),
    version: z.number().int().positive(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .superRefine((snapshot, context) => {
    if (snapshot.state !== 'active' && snapshot.discoverable) {
      context.addIssue({
        code: 'custom',
        message: 'Only active players may be discoverable.',
        path: ['discoverable'],
      });
    }
    if (snapshot.state !== 'active' && snapshot.messagingAllowed) {
      context.addIssue({
        code: 'custom',
        message: 'Only active players may send messages.',
        path: ['messagingAllowed'],
      });
    }
  });

export type PlayerLifecycleStateV1 = z.infer<
  typeof PlayerLifecycleStateV1Schema
>;
export type PlayerLifecycleSnapshotV1 = z.infer<
  typeof PlayerLifecycleSnapshotV1Schema
>;

export function isDiscoveryEligible(snapshot: PlayerLifecycleSnapshotV1) {
  return snapshot.state === 'active' && snapshot.discoverable;
}

export function isMessagingAllowed(snapshot: PlayerLifecycleSnapshotV1) {
  return snapshot.state === 'active' && snapshot.messagingAllowed;
}
