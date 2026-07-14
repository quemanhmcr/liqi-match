import { describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import type { AuthSession } from '@/shared/auth/auth-service';
import {
  CorrelationIdSchema,
  IdempotencyKeySchema,
} from '@/shared/contracts/core-v1';
import {
  ActivityItemV2Schema,
  PlayerIdSchema,
  PlaySessionIdSchema,
  SessionOutcomeSnapshotV2Schema,
} from '@/shared/contracts/core-v2';

import {
  SupabaseTrustOutcomesEngine,
  TrustOutcomesPrivilegedOperationError,
  type TrustOutcomesRpcTransport,
} from '../supabase-trust-outcomes-engine';

const PLAYER_A = PlayerIdSchema.parse('20000000-0000-4000-8000-000000000001');
const PLAYER_B = PlayerIdSchema.parse('20000000-0000-4000-8000-000000000002');
const SESSION_ID = PlaySessionIdSchema.parse(
  '42000000-0000-4000-8000-000000000001',
);
const fixtureRoot = path.join(
  process.cwd(),
  'contracts/core-v2/fixtures/provider',
);
const read = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8')) as unknown;

const session: AuthSession = {
  accessToken: 'access-token',
  expiresAt: 4_000_000_000,
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  user: { id: '10000000-0000-4000-8000-000000000001' },
};

function commandMeta<TExpectedVersion extends number>(
  sequence: number,
  expectedVersion: TExpectedVersion,
) {
  const suffix = String(sequence).padStart(12, '0');
  return {
    audit: {
      appVersion: '2.0.0-test',
      clientCreatedAt: '2026-07-14T12:25:00.000Z',
      clientRequestId: `49000000-0000-4000-8000-${suffix}`,
      platform: 'android' as const,
    },
    correlationId: CorrelationIdSchema.parse(
      `43000000-0000-4000-8000-${suffix}`,
    ),
    expectedVersion,
    idempotencyKey: IdempotencyKeySchema.parse(
      `core-v2-command-${String(sequence).padStart(4, '0')}`,
    ),
  };
}

const activity = () => ActivityItemV2Schema.parse(read('activity-item.json'));
const projection = () =>
  read('player-trust-projection.json') as Record<string, unknown>;
const confirmationReceipt = () =>
  read('participation-confirmation-receipt.json') as Record<string, unknown>;

function preferences(version = 1) {
  return {
    activityEnabled: true,
    feedbackPromptsEnabled: true,
    maxReactivationNotificationsPerDay: 2,
    playerId: PLAYER_A,
    pushReactivationEnabled: true,
    repeatPlayPromptsEnabled: true,
    updatedAt: '2026-07-14T12:10:00.000Z',
    version,
  };
}

function ledgerEntry() {
  return {
    createdAt: '2026-07-14T12:07:00.000Z',
    delta: 1,
    dimension: 'positive_endorsements',
    entryId: '47000000-0000-4000-8000-000000000010',
    metadata: { endorsementKind: 'cooperative' },
    playerId: PLAYER_A,
    sourceId: '46000000-0000-4000-8000-000000000001',
    sourceType: 'endorsement',
  };
}

function repeatReceipt() {
  return {
    aggregateId: '47000000-0000-4000-8000-000000000020',
    aggregateType: 'repeat_play_request',
    aggregateVersion: 1,
    commandName: 'request_repeat_session_v2',
    correlationId: '43000000-0000-4000-8000-000000000006',
    eventIds: ['48000000-0000-4000-8000-000000000020'],
    occurredAt: '2026-07-14T12:20:00.000Z',
    repeated: false,
    requestId: '47000000-0000-4000-8000-000000000020',
    resultCode: 'repeat_session_requested',
    teammatePlayerIds: [PLAYER_B],
  };
}

describe('SupabaseTrustOutcomesEngine', () => {
  it('maps participation confirmation and dispute to exact authoritative RPCs', async () => {
    const confirmed = confirmationReceipt();
    const disputed = {
      ...confirmed,
      commandName: 'dispute_session_participation_v2',
      resultCode: 'participation_disputed',
      confirmation: {
        ...(confirmed.confirmation as Record<string, unknown>),
        reasonCode: 'session_did_not_happen',
        status: 'disputed',
      },
      outcome: {
        ...(confirmed.outcome as Record<string, unknown>),
        state: 'disputed',
      },
    };
    const rpc = jest.fn<TrustOutcomesRpcTransport>();
    rpc.mockResolvedValueOnce(confirmed).mockResolvedValueOnce(disputed);
    const engine = new SupabaseTrustOutcomesEngine(rpc);

    await engine.confirmParticipation(session, {
      ...commandMeta(1, 1),
      sessionId: SESSION_ID,
    });
    await engine.disputeParticipation(session, {
      ...commandMeta(2, 2),
      note: 'The lobby never started.',
      reasonCode: 'session_did_not_happen',
      sessionId: SESSION_ID,
    });

    expect(rpc.mock.calls).toEqual([
      [
        'confirm_session_participation_v2',
        session,
        {
          p_audit: commandMeta(1, 1).audit,
          p_correlation_id: commandMeta(1, 1).correlationId,
          p_expected_version: 1,
          p_idempotency_key: commandMeta(1, 1).idempotencyKey,
          p_session_id: SESSION_ID,
        },
      ],
      [
        'dispute_session_participation_v2',
        session,
        {
          p_audit: commandMeta(2, 2).audit,
          p_correlation_id: commandMeta(2, 2).correlationId,
          p_expected_version: 2,
          p_idempotency_key: commandMeta(2, 2).idempotencyKey,
          p_note: 'The lobby never started.',
          p_reason_code: 'session_did_not_happen',
          p_session_id: SESSION_ID,
        },
      ],
    ]);
  });

  it('reads the actor-specific feedback surface from the dedicated RPC', async () => {
    const outcome = SessionOutcomeSnapshotV2Schema.parse(
      confirmationReceipt().outcome,
    );
    const surface = {
      actorConfirmation: null,
      actorPlayerId: PLAYER_A,
      allParticipantsConfirmed: false,
      confirmedPlayerIds: [],
      endorsementTargetPlayerIds: [],
      outcome,
    };
    const rpc = jest.fn<TrustOutcomesRpcTransport>();
    rpc.mockResolvedValue(surface);
    const engine = new SupabaseTrustOutcomesEngine(rpc);

    await expect(
      engine.getFeedbackSurface(session, SESSION_ID),
    ).resolves.toEqual(surface);
    expect(rpc).toHaveBeenCalledWith(
      'get_session_feedback_surface_v2',
      session,
      { p_session_id: SESSION_ID },
    );
  });

  it('maps endorsement and repeat-play create commands with dependency versions', async () => {
    const rpc = jest.fn<TrustOutcomesRpcTransport>();
    rpc
      .mockResolvedValueOnce(read('player-endorsement-receipt.json'))
      .mockResolvedValueOnce(repeatReceipt());
    const engine = new SupabaseTrustOutcomesEngine(rpc);

    await engine.submit(session, {
      ...commandMeta(3, 0),
      expectedOutcomeVersion: 3,
      kinds: ['good_communication', 'would_play_again'],
      sessionId: SESSION_ID,
      targetPlayerId: PLAYER_B,
    });
    await engine.requestRepeatSession(session, {
      ...commandMeta(6, 0),
      relationshipVersions: [{ teammatePlayerId: PLAYER_B, version: 1 }],
      teammatePlayerIds: [PLAYER_B],
    });

    expect(rpc.mock.calls[0]).toEqual([
      'submit_player_endorsement_v2',
      session,
      expect.objectContaining({
        p_expected_outcome_version: 3,
        p_expected_version: 0,
        p_kinds: ['good_communication', 'would_play_again'],
        p_target_player_id: PLAYER_B,
      }),
    ]);
    expect(rpc.mock.calls[1]).toEqual([
      'request_repeat_session_v2',
      session,
      expect.objectContaining({
        p_expected_version: 0,
        p_relationship_versions: [{ teammatePlayerId: PLAYER_B, version: 1 }],
        p_teammate_player_ids: [PLAYER_B],
      }),
    ]);
  });

  it('reads only typed outcome, ledger, projection, activity and preferences surfaces', async () => {
    const receipt = confirmationReceipt();
    const rpc = jest.fn<TrustOutcomesRpcTransport>();
    rpc
      .mockResolvedValueOnce(receipt.outcome)
      .mockResolvedValueOnce([ledgerEntry()])
      .mockResolvedValueOnce(projection())
      .mockResolvedValueOnce([activity()])
      .mockResolvedValueOnce([activity()])
      .mockResolvedValueOnce(preferences());
    const engine = new SupabaseTrustOutcomesEngine(rpc);

    await expect(engine.getOutcome(session, SESSION_ID)).resolves.toMatchObject(
      {
        sessionId: SESSION_ID,
      },
    );
    await expect(engine.listForPlayer(session, PLAYER_A)).resolves.toHaveLength(
      1,
    );
    await expect(engine.getForPlayer(session, PLAYER_B)).resolves.toMatchObject(
      {
        playerId: PLAYER_B,
      },
    );
    await expect(engine.list(session, { limit: 500 })).resolves.toHaveLength(1);
    await expect(engine.listRecommendations(session)).resolves.toHaveLength(1);
    await expect(engine.getPreferences(session)).resolves.toMatchObject({
      playerId: PLAYER_A,
    });

    expect(rpc.mock.calls).toEqual([
      ['get_session_outcome_v2', session, { p_session_id: SESSION_ID }],
      [
        'list_player_reputation_ledger_v2',
        session,
        { p_limit: 200, p_player_id: PLAYER_A },
      ],
      [
        'get_player_trust_projection_v2',
        session,
        { p_target_player_id: PLAYER_B },
      ],
      [
        'list_activity_items_v2',
        session,
        { p_include_dismissed: false, p_limit: 50 },
      ],
      ['list_repeat_play_recommendations_v2', session, { p_limit: 20 }],
      ['get_engagement_preferences_v2', session, {}],
    ]);
  });

  it('maps activity dismissal and exact preference updates', async () => {
    const dismissedActivity = {
      ...activity(),
      dismissedAt: '2026-07-14T12:30:00.000Z',
      version: 2,
    };
    const dismissReceipt = {
      activityItem: dismissedActivity,
      aggregateId: dismissedActivity.activityItemId,
      aggregateType: 'activity_item',
      aggregateVersion: 2,
      commandName: 'dismiss_activity_item_v2',
      correlationId: '43000000-0000-4000-8000-000000000007',
      eventIds: ['48000000-0000-4000-8000-000000000021'],
      occurredAt: '2026-07-14T12:30:00.000Z',
      repeated: false,
      resultCode: 'activity_item_dismissed',
    };
    const updatedPreferences = preferences(2);
    const preferencesReceipt = {
      aggregateId: PLAYER_A,
      aggregateType: 'engagement_preferences',
      aggregateVersion: 2,
      commandName: 'update_engagement_preferences_v2',
      correlationId: '43000000-0000-4000-8000-000000000008',
      eventIds: ['48000000-0000-4000-8000-000000000022'],
      occurredAt: '2026-07-14T12:31:00.000Z',
      preferences: updatedPreferences,
      repeated: false,
      resultCode: 'engagement_preferences_updated',
    };
    const rpc = jest.fn<TrustOutcomesRpcTransport>();
    rpc
      .mockResolvedValueOnce(dismissReceipt)
      .mockResolvedValueOnce(preferencesReceipt);
    const engine = new SupabaseTrustOutcomesEngine(rpc);

    await engine.dismiss(session, {
      ...commandMeta(7, 1),
      activityItemId: activity().activityItemId,
    });
    await engine.updatePreferences(session, {
      ...commandMeta(8, 1),
      preferences: {
        activityEnabled: true,
        feedbackPromptsEnabled: false,
        maxReactivationNotificationsPerDay: 2,
        pushReactivationEnabled: false,
        repeatPlayPromptsEnabled: true,
      },
    });

    expect(rpc.mock.calls[0]?.[0]).toBe('dismiss_activity_item_v2');
    expect(rpc.mock.calls[1]).toEqual([
      'update_engagement_preferences_v2',
      session,
      expect.objectContaining({
        p_preferences: {
          activityEnabled: true,
          feedbackPromptsEnabled: false,
          maxReactivationNotificationsPerDay: 2,
          pushReactivationEnabled: false,
          repeatPlayPromptsEnabled: true,
        },
      }),
    ]);
  });

  it('requires explicit service-role operations for event consumption and rebuild tooling', async () => {
    const event = read('session-completed.json');
    const outcome = SessionOutcomeSnapshotV2Schema.parse(
      confirmationReceipt().outcome,
    );
    const unusedRpc = jest.fn<TrustOutcomesRpcTransport>(async () => null);
    const engine = new SupabaseTrustOutcomesEngine(unusedRpc);

    await expect(
      engine.consumeCompletedSession(event as never),
    ).rejects.toBeInstanceOf(TrustOutcomesPrivilegedOperationError);
    await expect(engine.rebuildProjection(PLAYER_A)).rejects.toBeInstanceOf(
      TrustOutcomesPrivilegedOperationError,
    );

    const privileged = new SupabaseTrustOutcomesEngine(unusedRpc, {
      consumeCompletedSession: async () => ({
        eventIds: ['48000000-0000-4000-8000-000000000030'],
        outcome,
        repeated: false,
      }),
      rebuildProjection: async () => ({ projection: projection() }),
    });
    await expect(
      privileged.consumeCompletedSession(event as never),
    ).resolves.toMatchObject({ sessionId: outcome.sessionId });
    await expect(privileged.rebuildProjection(PLAYER_B)).resolves.toMatchObject(
      {
        playerId: PLAYER_B,
      },
    );
  });

  it('fails closed when an RPC response drifts from the executable contract', async () => {
    const rpc = jest.fn<TrustOutcomesRpcTransport>();
    rpc.mockResolvedValue({ playerId: PLAYER_A, reputationScore: 99 });
    const engine = new SupabaseTrustOutcomesEngine(rpc);

    await expect(engine.getForPlayer(session, PLAYER_A)).rejects.toThrow();
  });
});
