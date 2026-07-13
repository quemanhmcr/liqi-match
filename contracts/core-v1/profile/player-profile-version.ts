import { z } from 'zod';
import { ProfileIdSchema } from '../identity/semantic-ids';

export const PlayerProfileVersionV1Schema = z
  .object({
    profileId: ProfileIdSchema,
    version: z.number().int().nonnegative(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type PlayerProfileVersionV1 = z.infer<
  typeof PlayerProfileVersionV1Schema
>;
