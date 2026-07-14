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
  PlayerBlockedEventV2Schema,
  PlaySessionIdSchema,
  type PlaySessionId,
} from '@/shared/contracts/core-v2';
import { InMemoryConversationV2Authority } from '@/entities/conversation-v2';

import { createConversationV2SessionProvisioner } from '../conversation-v2-session-provisioner';
import { InMemoryRepeatPlaySessionService } from '../in-memory-repeat-play-session-service';
import type { PlaySessionActorContext } from '../play-session-repository';

const A = PlayerIdSchema.parse('a6000000-0000-4000-8000-000000000001');
const B = PlayerIdSchema.parse('a6000000-0000-4000-8000-000000000002');
const NOW = '2026-07-14T12:00:00.000Z';

function actor(playerId: PlayerId): PlaySessionActorContext {
  const suffix = playerId.slice(-12);
  return {
    lifecycle: PlayerLifecycleSnapshotV1Schema.parse({
      discoverable: true,
      messagingAllowed: true,
      playerId,
      profileId: `a6100000-0000-4000-8000-${suffix}`,
      state: 'active',
      updatedAt: NOW,
      version: 1,
    }),
    principal: AuthenticatedPrincipalV1Schema.parse({
      accountId: `a6200000-0000-4000-8000-${suffix}`,
      expiresAt: '2026-07-15T12:00:00.000Z',
      issuedAt: '2026-07-14T11:00:00.000Z',
      playerId,
      sessionId: `a6300000-0000-4000-8000-${suffix}`,
    }),
  };
}

function verified(context: PlaySessionActorContext) {
  return {
    accountId: context.principal.accountId,
    lifecycleVersion: context.lifecycle.version,
    messagingAllowed: true as const,
    playerId: context.lifecycle.playerId,
  };
}

function metadata(sequence: number, expectedVersion: number) {
  const suffix = String(sequence).padStart(12, '0');
  return {
    audit: {
      appVersion: '2.0.0-test',
      clientCreatedAt: NOW,
      clientRequestId: `a6400000-0000-4000-8000-${suffix}`,
      platform: 'android' as const,
    },
    correlationId: CorrelationIdSchema.parse(
      `a6500000-0000-4000-8000-${suffix}`,
    ),
    expectedVersion,
    idempotencyKey: IdempotencyKeySchema.parse(`social-policy.${suffix}`),
  };
}

function blockEvent(reasonCode: string | null = 'user_safety') {
  return PlayerBlockedEventV2Schema.parse({
    actorPlayerId: A,
    aggregateId: 'a6600000-0000-4000-8000-000000000001',
    aggregateType: 'social_relationship',
    aggregateVersion: 5,
    causationId: null,
    correlationId: 'a6700000-0000-4000-8000-000000000001',
    eventId: 'a6800000-0000-4000-8000-000000000001',
    eventType: 'player.blocked.v2',
    eventVersion: 2,
    occurredAt: '2026-07-14T12:30:00.000Z',
    payload: {
      blockedPlayerId: B,
      blockerPlayerId: A,
      reasonCode,
    },
  });
}

function harness() {
  let sequence = 100;
  const clock = (() => {
    let tick = 0;
    return () => new Date(Date.parse(NOW) + tick++ * 1_000);
  })();
  const conversation = new InMemoryConversationV2Authority({
    clock,
    createUuid: () =>
      `a6900000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
  });
  const sessions = new InMemoryRepeatPlaySessionService({
    clock,
    conversationProvisioner: createConversationV2SessionProvisioner({
      authority: conversation,
      clock,
    }),
    createUuid: () =>
      `a6a00000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    lifecycleProvider: { assertActive: async () => undefined },
    relationshipProvider: {
      getInviteEligibility: async () => ({
        allowed: true,
        blocked: false,
        reasonCodes: [],
      }),
    },
    sourceProvider: {
      getMatchParticipantIds: async () => [A, B],
      getSetSnapshot: async () => ({
        capacity: 2,
        memberPlayerIds: [A, B],
        ownerPlayerId: A,
        version: 1,
      }),
    },
  });
  return { conversation, sessions };
}

async function createAcceptedDuo(
  sessions: InMemoryRepeatPlaySessionService,
): Promise<PlaySessionId> {
  const created = await sessions.create(actor(A), {
    ...metadata(1, 0),
    capacity: 2,
    initialInviteePlayerIds: [B],
    scheduledFor: null,
    timezone: 'Asia/Bangkok',
    title: 'Safety duo',
  });
  const sessionId = PlaySessionIdSchema.parse(created.aggregateId);
  const invite = sessions.listSessionInvites(sessionId)[0];
  if (!invite) throw new Error('Expected pending invite.');
  await sessions.acceptInvite(actor(B), {
    ...metadata(2, created.aggregateVersion),
    inviteId: invite.id as never,
    sessionId,
  });
  return sessionId;
}

describe('Session player.blocked.v2 policy consumer', () => {
  it('consumes the exact Senior 1 supplier fixture and policy', () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          'contracts/core-v2/fixtures/consumer/session-block-enforcement.json',
        ),
        'utf8',
      ),
    ) as { event: unknown; policy: Record<string, unknown> };

    expect(PlayerBlockedEventV2Schema.parse(fixture.event)).toBeTruthy();
    expect(fixture.policy).toMatchObject({
      activePlay: {
        preserveHistoricalMembership: true,
        transition: 'disputed',
      },
      preStart: {
        cancelPendingInvites: true,
        deny: ['invite', 'join', 'ready_response', 'member_visibility'],
        revokeActiveMembership: true,
      },
      replay: 'idempotent',
      unblock: {
        restoreFriendship: false,
        restoreReadiness: false,
        restoreSessionMembership: false,
      },
    });
  });
  it('removes the non-owner before start and revokes conversation access through membership reconciliation', async () => {
    const { conversation, sessions } = harness();
    const sessionId = await createAcceptedDuo(sessions);
    const before = await sessions.get(actor(A), sessionId);
    const conversationId = before.communication.conversationId;
    expect(conversationId).not.toBeNull();

    const receipt = await sessions.consumePlayerBlocked(blockEvent());
    const after = await sessions.get(actor(A), sessionId);

    expect(receipt.actions).toEqual([
      {
        action: 'member_removed',
        membershipVersion: 3,
        sessionId,
        sessionVersion: 3,
      },
    ]);
    expect(after).toMatchObject({
      communication: { membershipVersion: 3, status: 'ready' },
      membershipVersion: 3,
      state: 'recruiting',
      version: 3,
    });
    expect(after.members.find((member) => member.playerId === B)).toMatchObject(
      { leftAt: blockEvent().occurredAt, state: 'removed' },
    );
    await expect(
      conversation.getConversation(verified(actor(B)), conversationId!),
    ).rejects.toMatchObject({ code: 'conversation_access_revoked' });
    await expect(sessions.get(actor(B), sessionId)).rejects.toMatchObject({
      code: 'session_visibility_revoked',
    });
    expect(sessions.listEvents(sessionId).at(-1)).toMatchObject({
      causationId: blockEvent().eventId,
      eventType: 'session.member_left.v2',
      payload: {
        memberPlayerId: B,
        reasonCode: 'relationship_blocked',
      },
    });

    const replay = await sessions.consumePlayerBlocked(blockEvent());
    expect(replay.repeated).toBe(true);
    expect((await sessions.get(actor(A), sessionId)).version).toBe(3);
    await expect(
      sessions.consumePlayerBlocked(blockEvent('different_reason')),
    ).rejects.toMatchObject({ code: 'event_replay_conflict' });
  });

  it('moves an in-progress session to disputed without changing membership or emitting completion', async () => {
    const { sessions } = harness();
    const sessionId = await createAcceptedDuo(sessions);
    let session = await sessions.get(actor(A), sessionId);
    const opened = await sessions.openReadyCheck(actor(A), {
      ...metadata(3, session.version),
      deadlineAt: '2026-07-14T13:00:00.000Z',
      sessionId,
    });
    const checkId = opened.session.readyCheck?.checkId;
    if (!checkId) throw new Error('Expected ready check.');
    const readyA = await sessions.respondReadyCheck(actor(A), {
      ...metadata(4, opened.aggregateVersion),
      checkId,
      response: 'ready',
      sessionId,
    });
    const readyB = await sessions.respondReadyCheck(actor(B), {
      ...metadata(5, readyA.aggregateVersion),
      checkId,
      response: 'ready',
      sessionId,
    });
    await sessions.start(actor(A), {
      ...metadata(6, readyB.aggregateVersion),
      sessionId,
    });

    const receipt = await sessions.consumePlayerBlocked(blockEvent());
    expect(receipt.actions[0]).toMatchObject({
      action: 'session_disputed',
      membershipVersion: 2,
      sessionVersion: 7,
    });
    await expect(sessions.get(actor(A), sessionId)).rejects.toMatchObject({
      code: 'session_visibility_revoked',
    });
    await expect(sessions.get(actor(B), sessionId)).rejects.toMatchObject({
      code: 'session_visibility_revoked',
    });
    await expect(sessions.listCurrent(actor(A))).resolves.toEqual([]);
    await expect(sessions.listCurrent(actor(B))).resolves.toEqual([]);
    expect(sessions.listEvents(sessionId).at(-1)).toMatchObject({
      causationId: blockEvent().eventId,
      eventType: 'session.safety_disputed.v2',
      payload: {
        blockedPlayerId: B,
        blockerPlayerId: A,
        sourceSocialEventId: blockEvent().eventId,
      },
    });
    expect(
      sessions
        .listEvents(sessionId)
        .some((event) => event.eventType === 'session.completed.v2'),
    ).toBe(false);
  });

  it('cancels a pending invite and never restores it implicitly after unblock', async () => {
    const { sessions } = harness();
    const created = await sessions.create(actor(A), {
      ...metadata(7, 0),
      capacity: 2,
      initialInviteePlayerIds: [B],
      scheduledFor: null,
      timezone: 'Asia/Bangkok',
      title: 'Pending safety invite',
    });
    const sessionId = PlaySessionIdSchema.parse(created.aggregateId);
    await expect(sessions.listInvites(actor(B))).resolves.toHaveLength(1);

    const receipt = await sessions.consumePlayerBlocked(blockEvent());
    expect(receipt.actions).toEqual([
      {
        action: 'invite_cancelled',
        cancelledInviteCount: 1,
        membershipVersion: 1,
        sessionId,
        sessionVersion: 2,
      },
    ]);
    await expect(sessions.listInvites(actor(B))).resolves.toEqual([]);
    expect(sessions.listSessionInvites(sessionId)).toEqual([
      expect.objectContaining({ state: 'cancelled', version: 2 }),
    ]);
    expect(sessions.listEvents(sessionId).at(-1)).toMatchObject({
      causationId: blockEvent().eventId,
      eventType: 'session.invite_cancelled.v2',
      payload: {
        reasonCode: 'relationship_blocked',
        sourceSocialEventId: blockEvent().eventId,
        targetPlayerId: B,
      },
    });

    // No player.unblocked.v2 consumer exists by design: unblock changes future
    // capability checks but never resurrects an old invite or membership.
    await expect(sessions.listInvites(actor(B))).resolves.toEqual([]);
    expect(sessions.listSessionInvites(sessionId)[0]?.state).toBe('cancelled');
  });

  it('cancels the open ready-check and rejects a removed member response', async () => {
    const { sessions } = harness();
    const sessionId = await createAcceptedDuo(sessions);
    const opened = await sessions.openReadyCheck(actor(A), {
      ...metadata(8, 2),
      deadlineAt: '2026-07-14T13:00:00.000Z',
      sessionId,
    });
    const checkId = opened.session.readyCheck?.checkId;
    if (!checkId) throw new Error('Expected ready check.');

    const receipt = await sessions.consumePlayerBlocked(blockEvent());
    expect(receipt.actions[0]).toMatchObject({
      action: 'member_removed',
      membershipVersion: 3,
      sessionVersion: 4,
    });
    const ownerSnapshot = await sessions.get(actor(A), sessionId);
    expect(ownerSnapshot.readyCheck).toMatchObject({ state: 'cancelled' });
    await expect(
      sessions.respondReadyCheck(actor(B), {
        ...metadata(9, 4),
        checkId,
        response: 'ready',
        sessionId,
      }),
    ).rejects.toMatchObject({ code: 'membership_required' });
    await expect(sessions.get(actor(B), sessionId)).rejects.toMatchObject({
      code: 'session_visibility_revoked',
    });
  });
});
