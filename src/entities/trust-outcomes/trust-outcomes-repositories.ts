import type { AuthSession } from '@/shared/auth/auth-service';
import type {
  ActivityItemV2,
  ConfirmSessionParticipationCommandV2,
  DisputeSessionParticipationCommandV2,
  DismissActivityItemCommandV2,
  DismissActivityItemReceiptV2,
  EngagementPreferencesV2,
  ParticipationCommandReceiptV2,
  PlayerTrustProjectionV2,
  ReputationLedgerEntryV2,
  RequestRepeatSessionCommandV2,
  RequestRepeatSessionReceiptV2,
  SessionCompletedEventV2Schema,
  SessionFeedbackSurfaceV2,
  SessionOutcomeSnapshotV2,
  SubmitPlayerEndorsementCommandV2,
  SubmitPlayerEndorsementReceiptV2,
  UpdateEngagementPreferencesCommandV2,
  UpdateEngagementPreferencesReceiptV2,
} from '@/shared/contracts/core-v2';
import type { z } from 'zod';

export type SessionCompletedEventV2 = z.infer<
  typeof SessionCompletedEventV2Schema
>;

export interface SessionOutcomeRepository {
  confirmParticipation(
    session: AuthSession,
    command: ConfirmSessionParticipationCommandV2,
  ): Promise<ParticipationCommandReceiptV2>;
  consumeCompletedSession(
    event: SessionCompletedEventV2,
  ): Promise<SessionOutcomeSnapshotV2>;
  disputeParticipation(
    session: AuthSession,
    command: DisputeSessionParticipationCommandV2,
  ): Promise<ParticipationCommandReceiptV2>;
  getFeedbackSurface(
    session: AuthSession,
    sessionId: string,
  ): Promise<SessionFeedbackSurfaceV2 | null>;
  getOutcome(
    session: AuthSession,
    sessionId: string,
  ): Promise<SessionOutcomeSnapshotV2 | null>;
}

export interface EndorsementCommandService {
  submit(
    session: AuthSession,
    command: SubmitPlayerEndorsementCommandV2,
  ): Promise<SubmitPlayerEndorsementReceiptV2>;
}

export interface ReputationLedgerProvider {
  listForPlayer(
    session: AuthSession,
    playerId: string,
  ): Promise<readonly ReputationLedgerEntryV2[]>;
  rebuildProjection(playerId: string): Promise<PlayerTrustProjectionV2>;
}

export interface PlayerTrustProjectionProvider {
  getForPlayer(
    session: AuthSession,
    playerId: string,
  ): Promise<PlayerTrustProjectionV2>;
}

export interface ActivityFeedRepository {
  dismiss(
    session: AuthSession,
    command: DismissActivityItemCommandV2,
  ): Promise<DismissActivityItemReceiptV2>;
  list(
    session: AuthSession,
    input?: Readonly<{ includeDismissed?: boolean; limit?: number }>,
  ): Promise<readonly ActivityItemV2[]>;
}

export interface RepeatPlayRecommendationProvider {
  listRecommendations(session: AuthSession): Promise<readonly ActivityItemV2[]>;
  requestRepeatSession(
    session: AuthSession,
    command: RequestRepeatSessionCommandV2,
  ): Promise<RequestRepeatSessionReceiptV2>;
}

export interface EngagementPolicyProvider {
  getPreferences(session: AuthSession): Promise<EngagementPreferencesV2>;
  updatePreferences(
    session: AuthSession,
    command: UpdateEngagementPreferencesCommandV2,
  ): Promise<UpdateEngagementPreferencesReceiptV2>;
}
