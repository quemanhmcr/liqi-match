import { describe, expect, it } from '@jest/globals';

import {
  SessionCompletedEventV2Schema,
  type PlayerId,
} from '@/shared/contracts/core-v2';
import type { AuthSession } from '@/shared/auth/auth-service';

import { InMemoryTrustOutcomesEngine } from '../in-memory-trust-outcomes-engine';

const PLAYER_A = '20000000-0000-4000-8000-000000000001' as PlayerId;
const PLAYER_B = '20000000-0000-4000-8000-000000000002' as PlayerId;
const PLAYER_C = '20000000-0000-4000-8000-000000000003' as PlayerId;
const SESSION_ONE = '42000000-0000-4000-8000-000000000001';
const SESSION_TWO = '42000000-0000-4000-8000-000000000002';

function authSession(
  playerId: PlayerId,
  state: 'active' | 'suspended' = 'active',
) {
  return {
    accessToken: 'access-token',
    expiresAt: 4_000_000_000,
    refreshToken: 'refresh-token',
    tokenType: 'bearer',
    user: { id: `account-${playerId}` },
    principal: {
      accountId: '10000000-0000-4000-8000-000000000001',
      expiresAt: '2099-01-01T00:00:00.000Z',
      issuedAt: '2026-07-14T00:00:00.000Z',
      playerId,
      sessionId: '11000000-0000-4000-8000-000000000001',
    },
    lifecycle: {
      discoverable: state === 'active',
      messagingAllowed: state === 'active',
      playerId,
      state,
      updatedAt: '2026-07-14T00:00:00.000Z',
      version: 1,
    },
  } as AuthSession;
}

function completedEvent(
  sessionId: string,
  eventId: string,
  completedAt: string,
) {
  return SessionCompletedEventV2Schema.parse({
    actorPlayerId: PLAYER_A,
    aggregateId: sessionId,
    aggregateType: 'play_session',
    aggregateVersion: 7,
    causationId: null,
    correlationId: '43000000-0000-4000-8000-000000000001',
    eventId,
    eventType: 'session.completed.v2',
    eventVersion: 2,
    occurredAt: completedAt,
    payload: {
      completedAt,
      participantPlayerIds: [PLAYER_A, PLAYER_B],
      roleAssignments: [],
      scheduledFor: null,
      sessionId,
      source: { kind: 'manual' },
      startedAt: new Date(
        Date.parse(completedAt) - 60 * 60 * 1000,
      ).toISOString(),
      verification: 'participant_quorum',
    },
  });
}

function commandMeta(sequence: number, expectedAggregateVersion: number) {
  return {
    correlationId: `43000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    expectedAggregateVersion,
    idempotencyKey: `core-v2-command-${String(sequence).padStart(4, '0')}`,
  } as const;
}

describe('InMemoryTrustOutcomesEngine', () => {
  it('runs the completed -> confirm -> endorse -> verified projection skeleton', async () => {
    const engine = new InMemoryTrustOutcomesEngine(
      () => new Date('2026-07-14T12:30:00.000Z'),
    );
    const sessionA = authSession(PLAYER_A);
    const sessionB = authSession(PLAYER_B);

    const initial = await engine.consumeCompletedSession(
      completedEvent(
        SESSION_ONE,
        '41000000-0000-4000-8000-000000000001',
        '2026-07-14T12:00:00.000Z',
      ),
    );
    expect(initial.state).toBe('awaiting_confirmation');

    const confirmationA = await engine.confirmParticipation(sessionA, {
      ...commandMeta(1, 1),
      sessionId: SESSION_ONE,
    });
    const confirmationB = await engine.confirmParticipation(sessionB, {
      ...commandMeta(2, 2),
      sessionId: SESSION_ONE,
    });
    expect(confirmationA.outcome.state).toBe('awaiting_confirmation');
    expect(confirmationB.outcome.state).toBe('confirmed');

    const endorsement = await engine.submit(sessionA, {
      ...commandMeta(3, 3),
      kinds: ['good_communication', 'would_play_again'],
      sessionId: SESSION_ONE,
      targetPlayerId: PLAYER_B,
    });
    expect(endorsement.endorsement.actorPlayerId).toBe(PLAYER_A);

    const projection = await engine.getForPlayer(sessionB, PLAYER_B);
    expect(projection).toMatchObject({
      completedSessions: 1,
      completionReliabilityBps: 10_000,
      positiveEndorsements: 2,
    });
    expect(projection).not.toHaveProperty('rating');
  });

  it('deduplicates completion and endorsement retries without duplicate ledger facts', async () => {
    const engine = new InMemoryTrustOutcomesEngine(
      () => new Date('2026-07-14T12:30:00.000Z'),
    );
    const sessionA = authSession(PLAYER_A);
    const sessionB = authSession(PLAYER_B);
    const event = completedEvent(
      SESSION_ONE,
      '41000000-0000-4000-8000-000000000001',
      '2026-07-14T12:00:00.000Z',
    );

    const firstOutcome = await engine.consumeCompletedSession(event);
    const replayedOutcome = await engine.consumeCompletedSession(event);
    expect(replayedOutcome).toEqual(firstOutcome);

    await engine.confirmParticipation(sessionA, {
      ...commandMeta(1, 1),
      sessionId: SESSION_ONE,
    });
    await engine.confirmParticipation(sessionB, {
      ...commandMeta(2, 2),
      sessionId: SESSION_ONE,
    });
    const command = {
      ...commandMeta(3, 3),
      kinds: ['cooperative'] as const,
      sessionId: SESSION_ONE,
      targetPlayerId: PLAYER_B,
    };
    const first = await engine.submit(sessionA, command);
    const replay = await engine.submit(sessionA, command);

    expect(first.repeated).toBe(false);
    expect(replay.repeated).toBe(true);
    expect(await engine.listForPlayer(sessionB, PLAYER_B)).toHaveLength(2);
  });

  it('rejects self endorsement, non-members, stale writes and inactive actors', async () => {
    const engine = new InMemoryTrustOutcomesEngine();
    const sessionA = authSession(PLAYER_A);
    const sessionB = authSession(PLAYER_B);
    await engine.consumeCompletedSession(
      completedEvent(
        SESSION_ONE,
        '41000000-0000-4000-8000-000000000001',
        '2026-07-14T12:00:00.000Z',
      ),
    );

    await expect(
      engine.confirmParticipation(authSession(PLAYER_C), {
        ...commandMeta(1, 1),
        sessionId: SESSION_ONE,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      engine.confirmParticipation(authSession(PLAYER_A, 'suspended'), {
        ...commandMeta(2, 1),
        sessionId: SESSION_ONE,
      }),
    ).rejects.toMatchObject({ code: 'player_suspended' });

    await engine.confirmParticipation(sessionA, {
      ...commandMeta(3, 1),
      sessionId: SESSION_ONE,
    });
    await expect(
      engine.confirmParticipation(sessionB, {
        ...commandMeta(4, 1),
        sessionId: SESSION_ONE,
      }),
    ).rejects.toMatchObject({ code: 'aggregate_version_conflict' });
  });

  it('derives repeat teammates deterministically after two confirmed sessions', async () => {
    const engine = new InMemoryTrustOutcomesEngine(
      () => new Date('2026-07-15T12:30:00.000Z'),
    );
    const sessionA = authSession(PLAYER_A);
    const sessionB = authSession(PLAYER_B);

    for (const [index, sessionId, eventId, completedAt] of [
      [
        1,
        SESSION_ONE,
        '41000000-0000-4000-8000-000000000001',
        '2026-07-14T12:00:00.000Z',
      ],
      [
        2,
        SESSION_TWO,
        '41000000-0000-4000-8000-000000000002',
        '2026-07-15T12:00:00.000Z',
      ],
    ] as const) {
      await engine.consumeCompletedSession(
        completedEvent(sessionId, eventId, completedAt),
      );
      await engine.confirmParticipation(sessionA, {
        ...commandMeta(index * 10 + 1, 1),
        sessionId,
      });
      await engine.confirmParticipation(sessionB, {
        ...commandMeta(index * 10 + 2, 2),
        sessionId,
      });
    }

    const recommendations = await engine.listRecommendations(sessionA);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]?.payload).toMatchObject({
      completedSessionCount: 2,
      teammatePlayerId: PLAYER_B,
    });

    const request = await engine.requestRepeatSession(sessionA, {
      ...commandMeta(99, 1),
      teammatePlayerIds: [PLAYER_B],
    });
    expect(request.teammatePlayerIds).toEqual([PLAYER_B]);

    const incremental = await engine.getForPlayer(sessionA, PLAYER_A);
    const rebuilt = await engine.rebuildProjection(PLAYER_A);
    expect({ ...rebuilt, rebuiltAt: null }).toEqual({
      ...incremental,
      rebuiltAt: null,
    });
    expect(rebuilt.repeatTeammateCount).toBe(1);
  });

  it('deduplicates activity items and respects engagement preferences', async () => {
    const engine = new InMemoryTrustOutcomesEngine(
      () => new Date('2026-07-14T12:30:00.000Z'),
    );
    const sessionA = authSession(PLAYER_A);
    const event = completedEvent(
      SESSION_ONE,
      '41000000-0000-4000-8000-000000000001',
      '2026-07-14T12:00:00.000Z',
    );
    await engine.consumeCompletedSession(event);
    await engine.consumeCompletedSession(
      SessionCompletedEventV2Schema.parse({
        ...event,
        eventId: '41000000-0000-4000-8000-000000000099',
      }),
    );
    expect(await engine.list(sessionA)).toHaveLength(1);

    const preferences = await engine.getPreferences(sessionA);
    await engine.updatePreferences(sessionA, {
      ...commandMeta(1, preferences.version),
      preferences: {
        activityEnabled: false,
        feedbackPromptsEnabled: false,
        maxReactivationNotificationsPerDay: 0,
        pushReactivationEnabled: false,
        repeatPlayPromptsEnabled: false,
      },
    });
    expect(await engine.list(sessionA)).toEqual([]);
  });

  it('fails closed for cross-player trust reads until privacy capability exists', async () => {
    const engine = new InMemoryTrustOutcomesEngine();

    await expect(
      engine.getForPlayer(authSession(PLAYER_A), PLAYER_B),
    ).rejects.toMatchObject({ code: 'privacy_capability_required' });
  });
});
