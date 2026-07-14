import { z } from 'zod';
import {
  AccountIdSchema,
  PlayerIdSchema,
  ProfileIdSchema,
} from './semantic-ids';

export const PlayerIdentityMappingV1Schema = z
  .object({
    accountId: AccountIdSchema,
    playerId: PlayerIdSchema,
    profileId: ProfileIdSchema,
  })
  .strict();

export type PlayerIdentityMappingV1 = z.infer<
  typeof PlayerIdentityMappingV1Schema
>;
