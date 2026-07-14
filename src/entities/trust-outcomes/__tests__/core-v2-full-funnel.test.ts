import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  AuthenticatedPrincipalV1Schema,
  CorrelationIdSchema,
  IdempotencyKeySchema,
  PlayerIdSchema,
  PlayerLifecycleSnapshotV1Schema,
  type PlayerId,
} from '@/shared/contracts/core-v1';
import {
  PlaySessionIdSchema,
  SocialRelationshipSnapshotV2Schema,
} from '@/shared/contracts/core-v2';
import type { AuthSession } from '@/shared/auth/auth-service';
import { InMemoryConversationV2Authority } from '@/entities/conversation-v2';
import { createConversationV2SessionProvisioner } from '@/entities/play-session/conversation-v2-session-provisioner';
import { InMemoryRepeatPlaySessionService } from '@/entities/play-session/in-memory-repeat-play-session-service';
import type {
  PlaySessionActorContext,
  PlaySessionSourceProvider,
} from '@/entities/play-session/play-session-repository';
import { createRepeatAwareRecommendationProvider } from '@/entities/play-session/repeat-play-session-bridge';
import { InMemorySocialRelationshipRepository } from '@/entities/social-relationship';

import { InMemoryTrustOutcomesEngine } from '../in-memory-trust-outcomes-engine';
import { createTrustAwarePlaySessionCommandService } from '../play-session-trust-outcome-bridge';

const PLAYER_A = PlayerIdSchema.parse('20000000-0000-4000-8000-000000000001');
const PLAYER_B = PlayerIdSchema.parse('20000000-0000-4000-8000-000000000002');
const NOW = '2026-07-14T12:00:00.000Z';
const fixtureRoot = path.join(
  process.cwd(),
  'contracts/core-v2/fixtures/provider',
);

function read(name: string) {
  return JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, name), 'utf8'),
  ) as unknown;
}

function uuidFactory(prefix: string) {
  let sequence = 1;
  return () =>
    `${prefix}-0000-4000-8000-${String(sequence++).padStart(12, '0')}`;
}

function monotonicClock() {
  let elapsedSeconds = 0;
  const start = Date.parse(NOW);
  return () => new Date(start + elapsedSeconds++ * 1_000);
}

function actor(playerId: PlayerId): PlaySessionActorContext {
  const suffix = playerId.slice(-12);
  return {
    lifecycle: PlayerLifecycleSnapshotV1Schema.parse({
      discoverable: true,
      messagingAllowed: true,
      playerId,
      profileId: `30000000-0000-4000-8000-${suffix}`,
      state: 'active',
      updatedAt: NOW,
      version: 1,
    }),
    principal: AuthenticatedPrincipalV1Schema.parse({
      accountId: `10000000-0000-4000-8000-${suffix}`,
      expiresAt: '2026-07-15T12:00:00.000Z',
      issuedAt: '2026-07-14T11:00:00.000Z',
      playerId,
      sessionId: `11000000-0000-4000-8000-${suffix}`,
    }),
  };
}

function authSession(context: PlaySessionActorContext): AuthSession {
  return {
    accessToken: 'simulation-access-token',
    expiresAt: 4_000_000_000,
    lifecycle: context.lifecycle,
    principal: context.principal,
    refreshToken: 'simulation-refresh-token',
    tokenType: 'bearer',
    user: { id: context.principal.accountId },
  };
}

function metadata<const TVersion extends number>(
  sequence: number,
  expectedVersion: TVersion,
) {
  const suffix = String(sequence).padStart(12, '0');
  return {
    audit: {
      appVersion: '2.0.0-test',
      clientCreatedAt: NOW,
      clientRequestId: `49000000-0000-4000-8000-${suffix}`,
      platform: 'android' as const,
    },
    correlationId: CorrelationIdSchema.parse(
      `43000000-0000-4000-8000-${suffix}`,
    ),
    expectedVersion,
    idempotencyKey: IdempotencyKeySchema.parse(`full-funnel-command-${suffix}`),
  };
}

const sourceProvider: PlaySessionSourceProvider = {
  async getMatchParticipantIds() {
    return [PLAYER_A, PLAYER_B];
  },
  async getSetSnapshot() {
    return {
      capacity: 2,
      memberPlayerIds: [PLAYER_A, PLAYER_B],
      ownerPlayerId: PLAYER_A,
      version: 1,
    };
  },
};

describe('Core V2 integrated full funnel', () => {
  it('runs session communication through repeat-session creation with authoritative trust facts', async () => {
    const clock = monotonicClock();
    const relationshipRepository = new InMemorySocialRelationshipRepository({
      relationships: [
        SocialRelationshipSnapshotV2Schema.parse(
          read('relationship-friend.json'),
        ),
      ],
    });
    const trust = new InMemoryTrustOutcomesEngine(
      clock,
      relationshipRepository,
    );
    const conversation = new InMemoryConversationV2Authority({
      clock,
      createUuid: uuidFactory('61000000'),
    });
    const sessions = new InMemoryRepeatPlaySessionService({
      clock,
      conversationProvisioner: createConversationV2SessionProvisioner({
        authority: conversation,
        clock,
      }),
      createUuid: uuidFactory('62000000'),
      sourceProvider,
    });
    const sessionCommands = createTrustAwarePlaySessionCommandService({
      delegate: sessions,
      eventLog: sessions,
      sessionOutcomeRepository: trust,
    });
    const repeatPlay = createRepeatAwareRecommendationProvider({
      consumer: sessions,
      delegate: trust,
      eventLog: trust,
    });
    const actorA = actor(PLAYER_A);
    const actorB = actor(PLAYER_B);
    const authA = authSession(actorA);
    const authB = authSession(actorB);

    const created = await sessionCommands.create(actorA, {
      ...metadata(1, 0),
      capacity: 2,
      initialInviteePlayerIds: [PLAYER_B],
      scheduledFor: null,
      timezone: 'Asia/Bangkok',
      title: 'Core V2 duo',
    });
    const sessionId = PlaySessionIdSchema.parse(created.aggregateId);
    const invite = sessions.listSessionInvites(sessionId)[0];
    expect(invite).toBeDefined();

    const accepted = await sessionCommands.acceptInvite(actorB, {
      ...metadata(2, 1),
      inviteId: invite!.id as never,
      sessionId,
    });
    const afterAccept = await sessions.get(actorA, sessionId);
    expect(afterAccept.communication).toMatchObject({ status: 'ready' });
    await expect(
      conversation.listInbox({
        accountId: actorA.principal.accountId,
        lifecycleVersion: actorA.lifecycle.version,
        messagingAllowed: true,
        playerId: PLAYER_A,
      }),
    ).resolves.toHaveLength(1);

    const opened = await sessionCommands.openReadyCheck(actorA, {
      ...metadata(3, accepted.aggregateVersion),
      deadlineAt: '2026-07-14T13:00:00.000Z',
      sessionId,
    });
    const checkId = opened.session.readyCheck?.checkId;
    expect(checkId).toBeDefined();

    const readyA = await sessionCommands.respondReadyCheck(actorA, {
      ...metadata(4, opened.aggregateVersion),
      checkId: checkId!,
      response: 'ready',
      sessionId,
    });
    const readyB = await sessionCommands.respondReadyCheck(actorB, {
      ...metadata(5, readyA.aggregateVersion),
      checkId: checkId!,
      response: 'ready',
      sessionId,
    });
    expect(readyB.resultCode).toBe('ready_check_passed');

    const started = await sessionCommands.start(actorA, {
      ...metadata(6, readyB.aggregateVersion),
      sessionId,
    });
    const claimA = await sessionCommands.proposeCompletion(actorA, {
      ...metadata(7, started.aggregateVersion),
      claim: 'completed',
      reasonCode: null,
      sessionId,
    });
    expect(claimA.resultCode).toBe('completion_pending');
    const claimB = await sessionCommands.proposeCompletion(actorB, {
      ...metadata(8, claimA.aggregateVersion),
      claim: 'completed',
      reasonCode: null,
      sessionId,
    });
    expect(claimB.resultCode).toBe('completed');

    const outcome = await trust.getOutcome(authA, sessionId);
    expect(outcome).toMatchObject({
      participantPlayerIds: [PLAYER_A, PLAYER_B],
      state: 'recorded',
      version: 1,
    });
    const confirmationA = await trust.confirmParticipation(authA, {
      ...metadata(9, 1),
      sessionId,
    });
    const confirmationB = await trust.confirmParticipation(authB, {
      ...metadata(10, confirmationA.aggregateVersion),
      sessionId,
    });
    expect(confirmationB.outcome.version).toBe(3);

    await trust.submit(authA, {
      ...metadata(11, 0),
      expectedOutcomeVersion: confirmationB.outcome.version,
      kinds: ['cooperative', 'would_play_again'],
      sessionId,
      targetPlayerId: PLAYER_B,
    });
    await expect(trust.getForPlayer(authB, PLAYER_B)).resolves.toMatchObject({
      completedSessions: 1,
      positiveEndorsements: 2,
      repeatTeammateCount: 0,
    });
    await expect(trust.listRecommendations(authA)).resolves.toEqual([
      expect.objectContaining({
        kind: 'repeat_play_recommendation',
        payload: expect.objectContaining({
          completedSessionCount: 1,
          teammatePlayerIds: [PLAYER_B],
        }),
      }),
    ]);

    const repeatReceipt = await repeatPlay.requestRepeatSession(authA, {
      ...metadata(12, 0),
      relationshipVersions: [{ teammatePlayerId: PLAYER_B, version: 0 }],
      teammatePlayerIds: [PLAYER_B],
    });
    const repeatEvent = trust
      .listEvents('repeat_play.requested.v2')
      .find((event) => event.eventId === repeatReceipt.eventIds[0]);
    expect(repeatEvent).toBeDefined();
    const repeatCreatedEvent = sessions
      .listEvents()
      .find(
        (event) =>
          event.eventType === 'session.created.v2' &&
          event.causationId === repeatEvent?.eventId,
      );
    expect(repeatCreatedEvent).toBeDefined();
    const repeatSessionId = PlaySessionIdSchema.parse(
      repeatCreatedEvent?.aggregateId,
    );
    const repeatSession = await sessions.get(actorA, repeatSessionId);
    expect(repeatSessionId).not.toBe(sessionId);
    expect(repeatSession.source).toEqual({
      kind: 'repeat_play',
      requestId: repeatReceipt.requestId,
    });
    expect(sessions.listSessionInvites(repeatSessionId)).toEqual([
      expect.objectContaining({ targetPlayerId: PLAYER_B }),
    ]);
  });
});
