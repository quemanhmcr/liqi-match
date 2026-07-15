import { z } from 'zod';

import {
  ActivityItemV2Schema,
  ConfirmSessionParticipationCommandV2Schema,
  DisputeSessionParticipationCommandV2Schema,
  DismissActivityItemCommandV2Schema,
  DismissActivityItemReceiptV2Schema,
  EngagementPreferencesV2Schema,
  ParticipationCommandReceiptV2Schema,
  PlayerTrustProjectionV2Schema,
  ReputationLedgerEntryV2Schema,
  RequestRepeatSessionCommandV2Schema,
  RequestRepeatSessionReceiptV2Schema,
  SessionCompletedEventV2Schema,
  SessionFeedbackSurfaceV2Schema,
  SessionOutcomeSnapshotV2Schema,
  SubmitPlayerEndorsementCommandV2Schema,
  SubmitPlayerEndorsementReceiptV2Schema,
  UpdateEngagementPreferencesCommandV2Schema,
  UpdateEngagementPreferencesReceiptV2Schema,
  type ActivityItemV2,
  type ConfirmSessionParticipationCommandV2,
  type DisputeSessionParticipationCommandV2,
  type DismissActivityItemCommandV2,
  type DismissActivityItemReceiptV2,
  type EngagementPreferencesV2,
  type ParticipationCommandReceiptV2,
  type PlayerTrustProjectionV2,
  type ReputationLedgerEntryV2,
  type RequestRepeatSessionCommandV2,
  type RequestRepeatSessionReceiptV2,
  type SessionFeedbackSurfaceV2,
  type SessionOutcomeSnapshotV2,
  type SubmitPlayerEndorsementCommandV2,
  type SubmitPlayerEndorsementReceiptV2,
  type UpdateEngagementPreferencesCommandV2,
  type UpdateEngagementPreferencesReceiptV2,
} from '@/shared/contracts/core-v2';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type {
  ActivityFeedRepository,
  EndorsementCommandService,
  EngagementPolicyProvider,
  PlayerTrustProjectionProvider,
  ReputationLedgerProvider,
  RepeatPlayRecommendationProvider,
  SessionCompletedEventV2,
  SessionOutcomeRepository,
} from './trust-outcomes-repositories';

const ActivityItemListV2Schema = z.array(ActivityItemV2Schema).max(50);
const ReputationLedgerListV2Schema = z
  .array(ReputationLedgerEntryV2Schema)
  .max(200);
const CompletedSessionConsumerReceiptV2Schema = z
  .object({
    eventIds: z.array(z.string().uuid()).max(20),
    outcome: SessionOutcomeSnapshotV2Schema,
    repeated: z.boolean(),
  })
  .strict();

export type TrustOutcomesRpcTransport = (
  functionName: string,
  session: AuthSession,
  body: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

export type TrustOutcomesPrivilegedOperations = Readonly<{
  consumeCompletedSession?(event: SessionCompletedEventV2): Promise<unknown>;
  rebuildProjection?(playerId: string): Promise<unknown>;
}>;

export class TrustOutcomesPrivilegedOperationError extends Error {
  readonly code = 'privileged_operation_unavailable';
  readonly retryable = false;

  constructor(operation: 'consumeCompletedSession' | 'rebuildProjection') {
    super(
      `${operation} requires a service-role worker and is unavailable in the mobile application runtime.`,
    );
    this.name = 'TrustOutcomesPrivilegedOperationError';
  }
}

export class SupabaseTrustOutcomesEngine
  implements
    SessionOutcomeRepository,
    EndorsementCommandService,
    ReputationLedgerProvider,
    PlayerTrustProjectionProvider,
    ActivityFeedRepository,
    RepeatPlayRecommendationProvider,
    EngagementPolicyProvider
{
  constructor(
    private readonly rpc: TrustOutcomesRpcTransport = callRpc,
    private readonly privileged: TrustOutcomesPrivilegedOperations = {},
  ) {}

  async confirmParticipation(
    session: AuthSession,
    rawCommand: ConfirmSessionParticipationCommandV2,
  ): Promise<ParticipationCommandReceiptV2> {
    const command =
      ConfirmSessionParticipationCommandV2Schema.parse(rawCommand);
    return ParticipationCommandReceiptV2Schema.parse(
      await this.rpc('confirm_session_participation_v2', session, {
        p_audit: command.audit,
        p_correlation_id: command.correlationId,
        p_expected_version: command.expectedVersion,
        p_idempotency_key: command.idempotencyKey,
        p_session_id: command.sessionId,
      }),
    );
  }

  async consumeCompletedSession(
    rawEvent: SessionCompletedEventV2,
  ): Promise<SessionOutcomeSnapshotV2> {
    const event = SessionCompletedEventV2Schema.parse(rawEvent);
    const consume = this.privileged.consumeCompletedSession;
    if (!consume) {
      throw new TrustOutcomesPrivilegedOperationError(
        'consumeCompletedSession',
      );
    }
    return CompletedSessionConsumerReceiptV2Schema.parse(await consume(event))
      .outcome;
  }

  async disputeParticipation(
    session: AuthSession,
    rawCommand: DisputeSessionParticipationCommandV2,
  ): Promise<ParticipationCommandReceiptV2> {
    const command =
      DisputeSessionParticipationCommandV2Schema.parse(rawCommand);
    return ParticipationCommandReceiptV2Schema.parse(
      await this.rpc('dispute_session_participation_v2', session, {
        p_audit: command.audit,
        p_correlation_id: command.correlationId,
        p_expected_version: command.expectedVersion,
        p_idempotency_key: command.idempotencyKey,
        p_note: command.note ?? null,
        p_reason_code: command.reasonCode,
        p_session_id: command.sessionId,
      }),
    );
  }

  async getFeedbackSurface(
    session: AuthSession,
    sessionId: string,
  ): Promise<SessionFeedbackSurfaceV2 | null> {
    const result = await this.rpc('get_session_feedback_surface_v2', session, {
      p_session_id: sessionId,
    });
    return result === null
      ? null
      : SessionFeedbackSurfaceV2Schema.parse(result);
  }

  async getOutcome(
    session: AuthSession,
    sessionId: string,
  ): Promise<SessionOutcomeSnapshotV2 | null> {
    const result = await this.rpc('get_session_outcome_v2', session, {
      p_session_id: sessionId,
    });
    return result === null
      ? null
      : SessionOutcomeSnapshotV2Schema.parse(result);
  }

  async submit(
    session: AuthSession,
    rawCommand: SubmitPlayerEndorsementCommandV2,
  ): Promise<SubmitPlayerEndorsementReceiptV2> {
    const command = SubmitPlayerEndorsementCommandV2Schema.parse(rawCommand);
    return SubmitPlayerEndorsementReceiptV2Schema.parse(
      await this.rpc('submit_player_endorsement_v2', session, {
        p_audit: command.audit,
        p_correlation_id: command.correlationId,
        p_expected_outcome_version: command.expectedOutcomeVersion,
        p_expected_version: command.expectedVersion,
        p_idempotency_key: command.idempotencyKey,
        p_kinds: command.kinds,
        p_session_id: command.sessionId,
        p_target_player_id: command.targetPlayerId,
      }),
    );
  }

  async listForPlayer(
    session: AuthSession,
    playerId: string,
  ): Promise<readonly ReputationLedgerEntryV2[]> {
    return ReputationLedgerListV2Schema.parse(
      await this.rpc('list_player_reputation_ledger_v2', session, {
        p_limit: 200,
        p_player_id: playerId,
      }),
    );
  }

  async rebuildProjection(playerId: string): Promise<PlayerTrustProjectionV2> {
    const rebuild = this.privileged.rebuildProjection;
    if (!rebuild) {
      throw new TrustOutcomesPrivilegedOperationError('rebuildProjection');
    }
    const result = await rebuild(playerId);
    const record = z
      .object({ projection: PlayerTrustProjectionV2Schema })
      .passthrough()
      .parse(result);
    return record.projection;
  }

  async getForPlayer(
    session: AuthSession,
    playerId: string,
  ): Promise<PlayerTrustProjectionV2> {
    return PlayerTrustProjectionV2Schema.parse(
      await this.rpc('get_player_trust_projection_v2', session, {
        p_target_player_id: playerId,
      }),
    );
  }

  async dismiss(
    session: AuthSession,
    rawCommand: DismissActivityItemCommandV2,
  ): Promise<DismissActivityItemReceiptV2> {
    const command = DismissActivityItemCommandV2Schema.parse(rawCommand);
    return DismissActivityItemReceiptV2Schema.parse(
      await this.rpc('dismiss_activity_item_v2', session, {
        p_activity_item_id: command.activityItemId,
        p_audit: command.audit,
        p_correlation_id: command.correlationId,
        p_expected_version: command.expectedVersion,
        p_idempotency_key: command.idempotencyKey,
      }),
    );
  }

  async list(
    session: AuthSession,
    input: Readonly<{ includeDismissed?: boolean; limit?: number }> = {},
  ): Promise<readonly ActivityItemV2[]> {
    return ActivityItemListV2Schema.parse(
      await this.rpc('list_activity_items_v2', session, {
        p_include_dismissed: input.includeDismissed ?? false,
        p_limit: normalizeLimit(input.limit),
      }),
    );
  }

  async listRecommendations(
    session: AuthSession,
  ): Promise<readonly ActivityItemV2[]> {
    return ActivityItemListV2Schema.parse(
      await this.rpc('list_repeat_play_recommendations_v2', session, {
        p_limit: 20,
      }),
    );
  }

  async requestRepeatSession(
    session: AuthSession,
    rawCommand: RequestRepeatSessionCommandV2,
  ): Promise<RequestRepeatSessionReceiptV2> {
    const command = RequestRepeatSessionCommandV2Schema.parse(rawCommand);
    return RequestRepeatSessionReceiptV2Schema.parse(
      await this.rpc('request_repeat_session_v2', session, {
        p_audit: command.audit,
        p_correlation_id: command.correlationId,
        p_expected_version: command.expectedVersion,
        p_idempotency_key: command.idempotencyKey,
        p_relationship_versions: command.relationshipVersions,
        p_teammate_player_ids: command.teammatePlayerIds,
      }),
    );
  }

  async getPreferences(session: AuthSession): Promise<EngagementPreferencesV2> {
    return EngagementPreferencesV2Schema.parse(
      await this.rpc('get_engagement_preferences_v2', session, {}),
    );
  }

  async updatePreferences(
    session: AuthSession,
    rawCommand: UpdateEngagementPreferencesCommandV2,
  ): Promise<UpdateEngagementPreferencesReceiptV2> {
    const command =
      UpdateEngagementPreferencesCommandV2Schema.parse(rawCommand);
    return UpdateEngagementPreferencesReceiptV2Schema.parse(
      await this.rpc('update_engagement_preferences_v2', session, {
        p_audit: command.audit,
        p_correlation_id: command.correlationId,
        p_expected_version: command.expectedVersion,
        p_idempotency_key: command.idempotencyKey,
        p_preferences: command.preferences,
      }),
    );
  }
}

async function callRpc(
  functionName: string,
  session: AuthSession,
  body: Readonly<Record<string, unknown>>,
) {
  return await supabaseRest<unknown>(`rpc/${functionName}`, {
    body,
    method: 'POST',
    session,
  });
}

function normalizeLimit(value: number | undefined) {
  if (value === undefined || !Number.isInteger(value)) return 20;
  return Math.min(Math.max(value, 1), 50);
}
