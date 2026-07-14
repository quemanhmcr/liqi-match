import type {
  ActivateMatchIntentCommandV1,
  ActivateMatchIntentReceiptV1,
  MatchIntentSnapshotV1,
  PauseMatchIntentCommandV1,
  PauseMatchIntentReceiptV1,
} from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';

export interface MatchIntentRepository {
  activate(
    session: AuthSession,
    command: ActivateMatchIntentCommandV1,
  ): Promise<ActivateMatchIntentReceiptV1>;
  getCurrent(session: AuthSession): Promise<MatchIntentSnapshotV1 | null>;
  pause(
    session: AuthSession,
    command: PauseMatchIntentCommandV1,
  ): Promise<PauseMatchIntentReceiptV1>;
}
