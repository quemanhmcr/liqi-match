import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  ReputationLedgerEntryV2Schema,
  SessionCompletedEventV2Schema,
  SocialRelationshipSnapshotV2Schema,
  TrustVisibilityDecisionV2Schema,
  type PlayerId,
} from '@/shared/contracts/core-v2';
import type { AuthSession } from '@/shared/auth/auth-service';

import { InMemorySocialRelationshipRepository } from '@/entities/social-relationship';

import { InMemoryTrustOutcomesEngine } from '../in-memory-trust-outcomes-engine';

const PLAYER_A = '20000000-0000-4000-8000-000000000001' as PlayerId;
const PLAYER_B = '20000000-0000-4000-8000-000000000002' as PlayerId;
const PLAYER_C = '20000000-0000-4000-8000-000000000003' as PlayerId;
const SESSION_ONE = '42000000-0000-4000-8000-000000000001';
const SESSION_TWO = '42000000-0000-4000-8000-000000000002';

const socialFixtureRoot = path.join(
  process.cwd(),
  'contracts/core-v2/fixtures/provider',
);

function socialRelationshipFixture(
  name: 'relationship-blocked.json' | 'relationship-friend.json',
) {
  return SocialRelationshipSnapshotV2Schema.parse(
    JSON.parse(fs.readFileSync(path.join(socialFixtureRoot, name), 'utf8')),
  );
}

function socialRelationshipRepository(
  input: Readonly<{
    relationshipName?: 'relationship-blocked.json' | 'relationship-friend.json';
    trustVisibilityName?:
      'trust-visibility-blocked.json' | 'trust-visibility-friend.json';
  }> = {},
) {
  return new InMemorySocialRelationshipRepository({
    relationships: input.relationshipName
      ? [socialRelationshipFixture(input.relationshipName)]
      : [],
    trustVisibility: input.trustVisibilityName
      ? [
          TrustVisibilityDecisionV2Schema.parse(
            JSON.parse(
              fs.readFileSync(
                path.join(socialFixtureRoot, input.trustVisibilityName),
                'utf8',
              ),
            ),
          ),
        ]
      : [],
  });
}

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
      scheduledFor: new Date(
        Date.parse(completedAt) - 90 * 60 * 1000,
      ).toISOString(),
      sessionId,
      source: { kind: 'manual' },
      startedAt: new Date(
        Date.parse(completedAt) - 60 * 60 * 1000,
      ).toISOString(),
      verification: 'participant_quorum',
    },
  });
}

function commandMeta(sequence: number, expectedVersion: number) {
  const suffix = String(sequence).padStart(12, '0');
  return {
    audit: {
      appVersion: '2.0.0-test',
      clientCreatedAt: '2026-07-14T12:25:00.000Z',
      clientRequestId: `49000000-0000-4000-8000-${suffix}`,
      deviceInstallationId: '49000000-0000-4000-8000-999999999999',
      platform: 'android' as const,
    },
    correlationId: `43000000-0000-4000-8000-${suffix}`,
    expectedVersion,
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
    expect(initial.state).toBe('recorded');

    const confirmationA = await engine.confirmParticipation(sessionA, {
      ...commandMeta(1, 1),
      sessionId: SESSION_ONE,
    });
    expect(await engine.getForPlayer(sessionA, PLAYER_A)).toMatchObject({
      completedSessions: 0,
    });

    const confirmationB = await engine.confirmParticipation(sessionB, {
      ...commandMeta(2, 2),
      sessionId: SESSION_ONE,
    });
    expect(confirmationA.outcome.state).toBe('recorded');
    expect(confirmationB.outcome.state).toBe('recorded');
    expect(await engine.getForPlayer(sessionA, PLAYER_A)).toMatchObject({
      completedSessions: 1,
    });
    expect(await engine.getForPlayer(sessionB, PLAYER_B)).toMatchObject({
      completedSessions: 1,
    });

    const endorsement = await engine.submit(sessionA, {
      ...commandMeta(3, 0),
      expectedOutcomeVersion: 3,
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

  it('exposes an authoritative reloadable feedback surface through quorum and endorsement', async () => {
    const engine = new InMemoryTrustOutcomesEngine();
    const sessionA = authSession(PLAYER_A);
    const sessionB = authSession(PLAYER_B);
    await engine.consumeCompletedSession(
      completedEvent(
        SESSION_ONE,
        '41000000-0000-4000-8000-000000000031',
        '2026-07-14T12:00:00.000Z',
      ),
    );

    await expect(
      engine.getFeedbackSurface(sessionA, SESSION_ONE),
    ).resolves.toMatchObject({
      actorConfirmation: null,
      actorPlayerId: PLAYER_A,
      allParticipantsConfirmed: false,
      confirmedPlayerIds: [],
      endorsementTargetPlayerIds: [],
    });
    const confirmedA = await engine.confirmParticipation(sessionA, {
      ...commandMeta(71, 1),
      sessionId: SESSION_ONE,
    });
    await expect(
      engine.getFeedbackSurface(sessionA, SESSION_ONE),
    ).resolves.toMatchObject({
      actorConfirmation: { status: 'confirmed' },
      allParticipantsConfirmed: false,
      confirmedPlayerIds: [PLAYER_A],
      endorsementTargetPlayerIds: [],
    });
    const confirmedB = await engine.confirmParticipation(sessionB, {
      ...commandMeta(72, confirmedA.aggregateVersion),
      sessionId: SESSION_ONE,
    });
    await expect(
      engine.getFeedbackSurface(sessionA, SESSION_ONE),
    ).resolves.toMatchObject({
      allParticipantsConfirmed: true,
      confirmedPlayerIds: [PLAYER_A, PLAYER_B],
      endorsementTargetPlayerIds: [PLAYER_B],
      outcome: { version: confirmedB.outcome.version },
    });
    await engine.submit(sessionA, {
      ...commandMeta(73, 0),
      expectedOutcomeVersion: confirmedB.outcome.version,
      kinds: ['cooperative'],
      sessionId: SESSION_ONE,
      targetPlayerId: PLAYER_B,
    });
    await expect(
      engine.getFeedbackSurface(sessionA, SESSION_ONE),
    ).resolves.toMatchObject({
      endorsementTargetPlayerIds: [],
    });
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
      ...commandMeta(3, 0),
      expectedOutcomeVersion: 3,
      kinds: ['cooperative'] as const,
      sessionId: SESSION_ONE,
      targetPlayerId: PLAYER_B,
    };
    const first = await engine.submit(sessionA, command);
    const replay = await engine.submit(sessionA, command);

    expect(first).toMatchObject({
      aggregateId: first.endorsement.endorsementId,
      aggregateType: 'player_endorsement',
      aggregateVersion: 1,
      commandName: 'submit_player_endorsement_v2',
      repeated: false,
      resultCode: 'endorsement_submitted',
    });
    expect(first.eventIds).toHaveLength(2);
    expect(replay.repeated).toBe(true);
    expect(replay.eventIds).toEqual(first.eventIds);
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

  it('does not record positive completion when a participant disputes before full confirmation', async () => {
    const engine = new InMemoryTrustOutcomesEngine(
      () => new Date('2026-07-14T12:30:00.000Z'),
    );
    const sessionA = authSession(PLAYER_A);
    const sessionB = authSession(PLAYER_B);
    await engine.consumeCompletedSession(
      completedEvent(
        SESSION_ONE,
        '41000000-0000-4000-8000-000000000021',
        '2026-07-14T12:00:00.000Z',
      ),
    );

    await engine.confirmParticipation(sessionA, {
      ...commandMeta(51, 1),
      sessionId: SESSION_ONE,
    });
    const dispute = await engine.disputeParticipation(sessionB, {
      ...commandMeta(52, 2),
      note: 'The session did not start.',
      reasonCode: 'session_did_not_happen',
      sessionId: SESSION_ONE,
    });

    expect(dispute.outcome.state).toBe('disputed');
    expect(await engine.getForPlayer(sessionA, PLAYER_A)).toMatchObject({
      completedSessions: 0,
    });
    expect(await engine.getForPlayer(sessionB, PLAYER_B)).toMatchObject({
      completedSessions: 0,
    });
    await expect(
      engine.confirmParticipation(sessionB, {
        ...commandMeta(53, 3),
        sessionId: SESSION_ONE,
      }),
    ).rejects.toMatchObject({ code: 'session_outcome_disputed' });
  });

  it('offers repeat play after one confirmed session without forming a repeat-teammate relationship', async () => {
    const engine = new InMemoryTrustOutcomesEngine(
      () => new Date('2026-07-14T12:30:00.000Z'),
      socialRelationshipRepository({
        relationshipName: 'relationship-friend.json',
      }),
    );
    const sessionA = authSession(PLAYER_A);
    const sessionB = authSession(PLAYER_B);
    await engine.consumeCompletedSession(
      completedEvent(
        SESSION_ONE,
        '41000000-0000-4000-8000-000000000021',
        '2026-07-14T12:00:00.000Z',
      ),
    );
    await engine.confirmParticipation(sessionA, {
      ...commandMeta(61, 1),
      sessionId: SESSION_ONE,
    });
    await engine.confirmParticipation(sessionB, {
      ...commandMeta(62, 2),
      sessionId: SESSION_ONE,
    });

    await expect(engine.listRecommendations(sessionA)).resolves.toEqual([
      expect.objectContaining({
        kind: 'repeat_play_recommendation',
        payload: expect.objectContaining({
          completedSessionCount: 1,
          relationshipId: null,
          teammatePlayerIds: [PLAYER_B],
        }),
      }),
    ]);
    await expect(
      engine.getForPlayer(sessionA, PLAYER_A),
    ).resolves.toMatchObject({
      completedSessions: 1,
      repeatTeammateCount: 0,
    });
    await expect(
      engine.requestRepeatSession(sessionA, {
        ...commandMeta(63, 0),
        relationshipVersions: [{ teammatePlayerId: PLAYER_B, version: 0 }],
        teammatePlayerIds: [PLAYER_B],
      }),
    ).resolves.toMatchObject({
      resultCode: 'repeat_session_requested',
      teammatePlayerIds: [PLAYER_B],
    });
  });

  it('derives repeat teammates deterministically after two confirmed sessions', async () => {
    const engine = new InMemoryTrustOutcomesEngine(
      () => new Date('2026-07-15T12:30:00.000Z'),
      socialRelationshipRepository({
        relationshipName: 'relationship-friend.json',
      }),
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
      teammatePlayerIds: [PLAYER_B],
    });

    const request = await engine.requestRepeatSession(sessionA, {
      ...commandMeta(99, 0),
      relationshipVersions: [{ teammatePlayerId: PLAYER_B, version: 1 }],
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

  it('filters blocked teammates and prevents repeat requests through Social authority', async () => {
    const engine = new InMemoryTrustOutcomesEngine(
      () => new Date('2026-07-15T12:30:00.000Z'),
      socialRelationshipRepository({
        relationshipName: 'relationship-blocked.json',
      }),
    );
    const sessionA = authSession(PLAYER_A);
    const sessionB = authSession(PLAYER_B);

    for (const [index, sessionId, eventId, completedAt] of [
      [
        1,
        SESSION_ONE,
        '41000000-0000-4000-8000-000000000011',
        '2026-07-14T12:00:00.000Z',
      ],
      [
        2,
        SESSION_TWO,
        '41000000-0000-4000-8000-000000000012',
        '2026-07-15T12:00:00.000Z',
      ],
    ] as const) {
      await engine.consumeCompletedSession(
        completedEvent(sessionId, eventId, completedAt),
      );
      await engine.confirmParticipation(sessionA, {
        ...commandMeta(index * 20 + 1, 1),
        sessionId,
      });
      await engine.confirmParticipation(sessionB, {
        ...commandMeta(index * 20 + 2, 2),
        sessionId,
      });
    }

    expect(await engine.listRecommendations(sessionA)).toEqual([]);
    await expect(
      engine.requestRepeatSession(sessionA, {
        ...commandMeta(199, 0),
        relationshipVersions: [{ teammatePlayerId: PLAYER_B, version: 1 }],
        teammatePlayerIds: [PLAYER_B],
      }),
    ).rejects.toMatchObject({ code: 'repeat_play_forbidden' });
  });

  it('uses friendship as a capability only and never as a reputation delta', async () => {
    const engine = new InMemoryTrustOutcomesEngine(
      undefined,
      socialRelationshipRepository({
        relationshipName: 'relationship-friend.json',
      }),
    );
    const sessionA = authSession(PLAYER_A);

    expect(await engine.listForPlayer(sessionA, PLAYER_A)).toEqual([]);
    expect(await engine.getForPlayer(sessionA, PLAYER_A)).toMatchObject({
      completedSessions: 0,
      positiveEndorsements: 0,
      repeatTeammateCount: 0,
    });
  });

  it('does not infer friendship from repeat play and excludes raw safety events from the ledger schema', async () => {
    const friend = socialRelationshipFixture('relationship-friend.json');
    const relationshipWithoutFriendship =
      SocialRelationshipSnapshotV2Schema.parse({
        ...friend,
        capabilities: {
          ...friend.capabilities,
          friendshipLabel: 'none',
        },
        friendship: {
          acceptedAt: null,
          label: 'none',
          requestId: null,
          requestState: null,
          requestVersion: null,
          state: 'none',
        },
      });
    expect(relationshipWithoutFriendship.friendship.state).toBe('none');
    expect(relationshipWithoutFriendship.capabilities.canInviteToSession).toBe(
      true,
    );

    const invalidSources = ['report', 'block'] as const;
    for (const sourceType of invalidSources) {
      expect(() =>
        ReputationLedgerEntryV2Schema.parse({
          createdAt: '2026-07-14T12:00:00.000Z',
          delta: -1,
          dimension: 'confirmed_moderation_actions',
          entryId: '51000000-0000-4000-8000-000000000001',
          metadata: {},
          playerId: PLAYER_B,
          sourceId: '52000000-0000-4000-8000-000000000001',
          sourceType,
        }),
      ).toThrow();
    }
  });

  it('fails closed when the trust visibility provider is unavailable', async () => {
    const engine = new InMemoryTrustOutcomesEngine();

    await expect(
      engine.getForPlayer(authSession(PLAYER_A), PLAYER_B),
    ).rejects.toMatchObject({ code: 'trust_visibility_unavailable' });
  });

  it('allows or denies cross-player projection reads only from Social visibility authority', async () => {
    const allowed = new InMemoryTrustOutcomesEngine(
      undefined,
      socialRelationshipRepository({
        trustVisibilityName: 'trust-visibility-friend.json',
      }),
    );
    const blocked = new InMemoryTrustOutcomesEngine(
      undefined,
      socialRelationshipRepository({
        trustVisibilityName: 'trust-visibility-blocked.json',
      }),
    );

    await expect(
      allowed.getForPlayer(authSession(PLAYER_A), PLAYER_B),
    ).resolves.toMatchObject({ playerId: PLAYER_B });
    await expect(
      blocked.getForPlayer(authSession(PLAYER_A), PLAYER_B),
    ).rejects.toMatchObject({ code: 'privacy_forbidden' });
  });
});
