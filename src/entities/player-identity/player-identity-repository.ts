import type { AuthSession } from '@/shared/auth/auth-service';
import type { PlayerId, PlayerSummaryV1 } from '@/shared/contracts/core-v1';

export interface PlayerIdentityRepository {
  listVisible(
    session: AuthSession,
    playerIds: readonly PlayerId[],
  ): Promise<readonly PlayerSummaryV1[]>;
}
