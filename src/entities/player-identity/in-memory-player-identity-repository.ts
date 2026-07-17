import type { AuthSession } from '@/shared/auth/auth-service';
import {
  PlayerSummaryV1Schema,
  ProfileIdSchema,
  type PlayerId,
  type PlayerSummaryV1,
} from '@/shared/contracts/core-v1';

import type { PlayerIdentityRepository } from './player-identity-repository';

export class InMemoryPlayerIdentityRepository implements PlayerIdentityRepository {
  constructor(
    private readonly identities: ReadonlyMap<
      PlayerId,
      PlayerSummaryV1
    > = new Map(),
  ) {}

  async listVisible(_session: AuthSession, playerIds: readonly PlayerId[]) {
    return [...new Set(playerIds)].slice(0, 50).map((playerId, index) => {
      const known = this.identities.get(playerId);
      if (known) return known;
      return PlayerSummaryV1Schema.parse({
        avatarAssetId: null,
        avatarUrl: null,
        displayName: `Người chơi ${index + 1}`,
        playerId,
        primaryRole: null,
        profileId: ProfileIdSchema.parse(playerId),
        profileVersion: 1,
        rank: null,
      });
    });
  }
}
