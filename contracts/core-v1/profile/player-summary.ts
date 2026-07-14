import { z } from 'zod';
import { PlayerIdSchema, ProfileIdSchema } from '../identity/semantic-ids';

export const PlayerSummaryV1Schema = z.object({
  playerId: PlayerIdSchema,
  profileId: ProfileIdSchema,
  profileVersion: z.number().int().nonnegative(),
  displayName: z.string().min(2).max(40),
  avatarAssetId: z.string().uuid().nullable().optional(),
  avatarUrl: z.string().url().nullable(),
  rank: z
    .object({
      id: z.string().uuid(),
      slug: z.string().min(1),
      name: z.string().min(1),
    })
    .nullable(),
  primaryRole: z
    .object({
      id: z.string().uuid(),
      slug: z.string().min(1),
      name: z.string().min(1),
    })
    .nullable(),
});

export type PlayerSummaryV1 = z.infer<typeof PlayerSummaryV1Schema>;
