import type {
  PlayerDecisionCommandV1,
  PlayerDecisionReceiptV1,
} from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';

export interface MatchDecisionRepository {
  decide(
    session: AuthSession,
    command: PlayerDecisionCommandV1,
  ): Promise<PlayerDecisionReceiptV1>;
}
