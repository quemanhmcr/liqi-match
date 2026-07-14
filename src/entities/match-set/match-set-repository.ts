import type {
  CreateSetInviteCommandV1,
  RequestSetJoinCommandV1,
  SetDiscoveryPageV1,
  SetInviteReceiptV1,
  SetJoinRequestReceiptV1,
} from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';

export interface MatchSetRepository {
  list(
    session: AuthSession,
    input: { cursor?: string | null; limit?: number },
  ): Promise<SetDiscoveryPageV1>;
  invite(
    session: AuthSession,
    command: CreateSetInviteCommandV1,
  ): Promise<SetInviteReceiptV1>;
  requestJoin(
    session: AuthSession,
    command: RequestSetJoinCommandV1,
  ): Promise<SetJoinRequestReceiptV1>;
}
