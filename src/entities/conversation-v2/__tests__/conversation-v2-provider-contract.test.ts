import { describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AccountIdSchema,
  CorrelationIdSchema,
  EventIdSchema,
  IdempotencyKeySchema,
  MatchIdSchema,
  PlayerIdSchema,
  ProfileIdSchema,
  RequestIdSchema,
  SessionIdSchema,
} from '@/shared/contracts/core-v1';
import { SocialRelationshipSnapshotV2Schema } from '@/shared/contracts/core-v2';
import type {
  CoreV2CommandMetadata,
  ProvisionDirectConversationCommandV2,
  ProvisionSessionConversationCommandV2,
} from '@/shared/contracts/core-v2';

import { ConversationV2ProviderError } from '../conversation-v2-error';
import { InMemoryConversationV2Authority } from '../in-memory-conversation-v2-authority';
import type { VerifiedConversationActorV2 } from '../conversation-v2-provider';
import { resolveVerifiedConversationActorV2 } from '../verified-conversation-actor';

const playerA = PlayerIdSchema.parse(uuid(1));
const playerB = PlayerIdSchema.parse(uuid(2));
const playerC = PlayerIdSchema.parse(uuid(3));
const actorA = actor(playerA, 101);
const actorB = actor(playerB, 102);
const actorC = actor(playerC, 103);

function createHarness() {
  let id = 500;
  let tick = 0;
  const notificationFacts: unknown[] = [];
  const authority = new InMemoryConversationV2Authority({
    clock: () =>
      new Date(Date.parse('2026-07-14T12:00:00.000Z') + tick++ * 1000),
    createUuid: () => uuid(id++),
    notificationProvider: {
      async publish(fact) {
        notificationFacts.push(fact);
      },
    },
  });
  return { authority, notificationFacts };
}

function actor(
  playerId: ReturnType<typeof PlayerIdSchema.parse>,
  suffix: number,
) {
  return {
    accountId: AccountIdSchema.parse(uuid(suffix)),
    playerId,
    lifecycleVersion: 7,
    messagingAllowed: true,
  } satisfies VerifiedConversationActorV2;
}

function metadata(
  expectedAggregateVersion: number,
  suffix: number,
  prefix = 'conversation-v2',
): CoreV2CommandMetadata {
  return {
    idempotencyKey: IdempotencyKeySchema.parse(`${prefix}:${uuid(suffix)}`),
    correlationId: CorrelationIdSchema.parse(uuid(suffix + 1000)),
    causationId: null,
    expectedAggregateVersion,
    audit: {
      requestId: RequestIdSchema.parse(`request-${suffix}`),
      clientCreatedAt: '2026-07-14T12:00:00.000Z',
      clientPlatform: 'simulation',
      clientVersion: '2.0.0-test',
    },
  };
}

function sessionCommand(suffix = 1): ProvisionSessionConversationCommandV2 {
  return {
    source: {
      sourceType: 'play_session',
      sourceId: SessionIdSchema.parse(uuid(200)),
      sourceVersion: 1,
    },
    title: 'Ranked squad',
    members: [
      { playerId: playerA, role: 'owner' },
      { playerId: playerB, role: 'member' },
    ],
    metadata: metadata(0, suffix, 'provision-session'),
  };
}

function friendshipCommand(suffix = 20): ProvisionDirectConversationCommandV2 {
  return {
    source: {
      sourceType: 'friendship',
      sourceId: uuid(201),
      sourceVersion: 1,
    },
    participantPlayerIds: [playerA, playerB],
    metadata: metadata(0, suffix, 'provision-friendship'),
  };
}

async function provisionSession() {
  const harness = createHarness();
  const receipt = await harness.authority.provisionSession(
    actorA,
    sessionCommand(),
  );
  return { ...harness, conversationId: receipt.conversationId, receipt };
}

function expectProviderError(
  error: unknown,
  code: ConversationV2ProviderError['code'],
) {
  expect(error).toBeInstanceOf(ConversationV2ProviderError);
  expect((error as ConversationV2ProviderError).code).toBe(code);
}

describe('Core V2 conversation provider contract', () => {
  it('runs the session conversation walking skeleton end to end', async () => {
    const { authority, conversationId, receipt } = await provisionSession();

    expect(receipt.commandName).toBe('provision_session_conversation_v2');
    expect(await authority.listInbox(actorA)).toHaveLength(1);
    expect(await authority.listInbox(actorB)).toHaveLength(1);

    const sent = await authority.sendText(actorA, {
      conversationId,
      clientMessageId: IdempotencyKeySchema.parse(
        `client-message:${uuid(300)}`,
      ),
      text: 'Sẵn sàng lúc 20:00 nhé.',
      metadata: metadata(1, 2, 'send-message'),
    });
    expect(sent.message?.sequence).toBe(1);
    expect(
      (await authority.getTimeline(actorB, conversationId)).at(-1)?.content,
    ).toEqual({
      kind: 'text',
      text: 'Sẵn sàng lúc 20:00 nhé.',
    });

    const read = await authority.advanceReadCursor(actorB, {
      conversationId,
      lastReadSequence: 1,
      metadata: metadata(2, 3, 'advance-read'),
    });
    expect(read.readCursor?.lastReadSequence).toBe(1);

    const addC = await authority.reconcile(null, {
      conversationId,
      source: {
        ...sessionCommand().source,
        sourceVersion: 2,
      },
      members: [
        { playerId: playerA, role: 'owner' },
        { playerId: playerB, role: 'member' },
        { playerId: playerC, role: 'member' },
      ],
      revocationReason: 'source_membership_revoked',
      metadata: metadata(3, 4, 'reconcile-members'),
    });
    expect(addC.aggregateVersion).toBe(4);
    expect(await authority.listInbox(actorC)).toHaveLength(1);

    await authority.reconcile(null, {
      conversationId,
      source: {
        ...sessionCommand().source,
        sourceVersion: 3,
      },
      members: [
        { playerId: playerA, role: 'owner' },
        { playerId: playerB, role: 'member' },
      ],
      revocationReason: 'source_membership_revoked',
      metadata: metadata(4, 5, 'reconcile-members'),
    });

    await expect(
      authority.getTimeline(actorC, conversationId),
    ).rejects.toMatchObject({
      code: 'conversation_access_revoked',
    });
    expect(authority.events().map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        'conversation.provisioned.v2',
        'message.sent.v2',
        'conversation.read_advanced.v2',
        'conversation.member_added.v2',
        'conversation.member_removed.v2',
        'conversation.access_revoked.v2',
      ]),
    );
  });

  it('returns the same authoritative message receipt for duplicate clientMessageId', async () => {
    const { authority, conversationId } = await provisionSession();
    const clientMessageId = IdempotencyKeySchema.parse(
      `client-message:${uuid(301)}`,
    );
    const first = await authority.sendText(actorA, {
      conversationId,
      clientMessageId,
      text: 'Queue once',
      metadata: metadata(1, 6, 'send-message'),
    });
    const replay = await authority.sendText(actorA, {
      conversationId,
      clientMessageId,
      text: 'Queue once',
      metadata: metadata(999, 7, 'send-message'),
    });

    expect(replay.repeated).toBe(true);
    expect(replay.message?.messageId).toBe(first.message?.messageId);
    expect(await authority.getTimeline(actorB, conversationId)).toHaveLength(1);
  });

  it('rejects a duplicate clientMessageId bound to different content', async () => {
    const { authority, conversationId } = await provisionSession();
    const clientMessageId = IdempotencyKeySchema.parse(
      `client-message:${uuid(302)}`,
    );
    await authority.sendText(actorA, {
      conversationId,
      clientMessageId,
      text: 'Original',
      metadata: metadata(1, 8, 'send-message'),
    });

    await expect(
      authority.sendText(actorA, {
        conversationId,
        clientMessageId,
        text: 'Changed',
        metadata: metadata(2, 9, 'send-message'),
      }),
    ).rejects.toMatchObject({ code: 'message_idempotency_conflict' });
  });

  it('revokes API, realtime subscription, and notification eligibility after membership removal', async () => {
    const { authority, conversationId, notificationFacts } =
      await provisionSession();
    const accessUpdates: unknown[] = [];
    authority.subscribeAccess(actorB, conversationId, (access) => {
      accessUpdates.push(access);
    });

    await authority.reconcile(null, {
      conversationId,
      source: { ...sessionCommand().source, sourceVersion: 2 },
      members: [
        { playerId: playerA, role: 'owner' },
        { playerId: playerC, role: 'member' },
      ],
      revocationReason: 'source_membership_revoked',
      metadata: metadata(1, 10, 'reconcile-members'),
    });

    expect(accessUpdates).toContainEqual(
      expect.objectContaining({ canSend: false, canSubscribe: false }),
    );
    expect(() =>
      authority.subscribeAccess(actorB, conversationId, jest.fn()),
    ).toThrow(expect.objectContaining({ code: 'conversation_access_revoked' }));
    await expect(
      authority.sendText(actorB, {
        conversationId,
        clientMessageId: IdempotencyKeySchema.parse(
          `client-message:${uuid(303)}`,
        ),
        text: 'Should fail',
        metadata: metadata(2, 11, 'send-message'),
      }),
    ).rejects.toMatchObject({ code: 'conversation_access_revoked' });

    await authority.sendText(actorA, {
      conversationId,
      clientMessageId: IdempotencyKeySchema.parse(
        `client-message:${uuid(304)}`,
      ),
      text: 'Only active members receive this',
      metadata: metadata(2, 12, 'send-message'),
    });
    expect(notificationFacts).toContainEqual(
      expect.objectContaining({ recipientPlayerId: playerC }),
    );
    expect(notificationFacts).not.toContainEqual(
      expect.objectContaining({ recipientPlayerId: playerB }),
    );
  });

  it('consumes authoritative block revocation without defining block semantics', async () => {
    const { authority } = createHarness();
    const provisioned = await authority.provisionDirect(
      actorA,
      friendshipCommand(),
    );

    await authority.reconcile(null, {
      conversationId: provisioned.conversationId,
      source: { ...friendshipCommand().source, sourceVersion: 2 },
      members: [],
      revocationReason: 'blocked',
      metadata: metadata(1, 21, 'reconcile-block'),
    });

    await expect(
      authority.getConversation(actorA, provisioned.conversationId),
    ).rejects.toMatchObject({
      code: 'conversation_access_revoked',
      details: { reason: 'blocked' },
    });
    expect(
      authority
        .events()
        .filter(
          (event) => event.eventType === 'conversation.access_revoked.v2',
        ),
    ).toHaveLength(2);
  });

  it('enforces monotonic read cursors and aggregate versions', async () => {
    const { authority, conversationId } = await provisionSession();
    await authority.sendText(actorA, {
      conversationId,
      clientMessageId: IdempotencyKeySchema.parse(
        `client-message:${uuid(305)}`,
      ),
      text: 'Read me',
      metadata: metadata(1, 13, 'send-message'),
    });
    await authority.advanceReadCursor(actorB, {
      conversationId,
      lastReadSequence: 1,
      metadata: metadata(2, 14, 'advance-read'),
    });

    await expect(
      authority.advanceReadCursor(actorB, {
        conversationId,
        lastReadSequence: 0,
        metadata: metadata(3, 15, 'advance-read'),
      }),
    ).rejects.toMatchObject({ code: 'read_cursor_regression' });
    await expect(
      authority.advanceReadCursor(actorA, {
        conversationId,
        lastReadSequence: 2,
        metadata: metadata(3, 16, 'advance-read'),
      }),
    ).rejects.toMatchObject({ code: 'read_cursor_ahead' });
  });

  it('deduplicates replayed system events and rejects unsupported versions', async () => {
    const { authority, conversationId } = await provisionSession();
    const activity = {
      conversationId,
      source: sessionCommand().source,
      sourceEventId: EventIdSchema.parse(uuid(400)),
      sourceEventType: 'session.ready_check_opened.v2',
      sourceEventVersion: 2,
      correlationId: CorrelationIdSchema.parse(uuid(401)),
      causationId: null,
      payload: { deadlineAt: '2026-07-14T12:15:00.000Z' },
    } as const;

    const first = await authority.projectSystemActivity(activity);
    const replay = await authority.projectSystemActivity(activity);
    expect(replay.messageId).toBe(first.messageId);
    expect(await authority.getTimeline(actorA, conversationId)).toHaveLength(1);

    await expect(
      authority.projectSystemActivity({ ...activity, sourceEventVersion: 3 }),
    ).rejects.toMatchObject({ code: 'unsupported_event_version' });
  });

  it('captures immutable report evidence and preserves tombstoned history', async () => {
    const { authority, conversationId } = await provisionSession();
    const sent = await authority.sendText(actorA, {
      conversationId,
      clientMessageId: IdempotencyKeySchema.parse(
        `client-message:${uuid(306)}`,
      ),
      text: 'Evidence body',
      metadata: metadata(1, 17, 'send-message'),
    });
    const evidence = await authority.captureReportEvidence({
      actor: actorB,
      conversationId,
      messageId: sent.message!.messageId,
      reportId: 'report-1',
    });
    const replay = await authority.captureReportEvidence({
      actor: actorB,
      conversationId,
      messageId: sent.message!.messageId,
      reportId: 'report-1',
    });
    expect(replay).toEqual(evidence);

    await authority.tombstone(null, {
      conversationId,
      reason: 'source_closed',
      metadata: metadata(2, 18, 'tombstone'),
    });
    expect(await authority.getTimeline(actorB, conversationId)).toHaveLength(1);
    await expect(
      authority.sendText(actorA, {
        conversationId,
        clientMessageId: IdempotencyKeySchema.parse(
          `client-message:${uuid(307)}`,
        ),
        text: 'No writes after tombstone',
        metadata: metadata(3, 19, 'send-message'),
      }),
    ).rejects.toMatchObject({ code: 'conversation_tombstoned' });
  });

  it('keeps source-to-conversation mapping unique and replay-safe', async () => {
    const { authority } = createHarness();
    const first = await authority.provisionSession(actorA, sessionCommand(30));
    const replay = await authority.provisionSession(actorA, {
      ...sessionCommand(31),
      metadata: metadata(0, 31, 'provision-session'),
    });
    expect(replay.conversationId).toBe(first.conversationId);
    expect(replay.repeated).toBe(true);

    await expect(
      authority.provisionSession(actorA, {
        ...sessionCommand(32),
        title: 'Conflicting title',
        metadata: metadata(0, 32, 'provision-session'),
      }),
    ).rejects.toMatchObject({ code: 'conversation_source_conflict' });
  });

  it('resolves actor only from matching active Core V1 principal/lifecycle', () => {
    const activeSession = authSession('active', true);
    expect(resolveVerifiedConversationActorV2(activeSession)).toEqual(
      expect.objectContaining({ playerId: playerA, messagingAllowed: true }),
    );

    expect(() =>
      resolveVerifiedConversationActorV2(authSession('suspended', false)),
    ).toThrow(expect.objectContaining({ code: 'player_lifecycle_forbidden' }));
    expect(() =>
      resolveVerifiedConversationActorV2({
        ...activeSession,
        lifecycle: {
          ...activeSession.lifecycle!,
          playerId: playerB,
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'unauthenticated' }));
  });

  it('returns stable provider errors for stale aggregate writes', async () => {
    const { authority, conversationId } = await provisionSession();
    try {
      await authority.sendText(actorA, {
        conversationId,
        clientMessageId: IdempotencyKeySchema.parse(
          `client-message:${uuid(308)}`,
        ),
        text: 'Stale',
        metadata: metadata(99, 40, 'send-message'),
      });
      throw new Error('expected provider error');
    } catch (error) {
      expectProviderError(error, 'conversation_version_conflict');
      expect((error as ConversationV2ProviderError).retryable).toBe(true);
    }
  });
  it('integrates Senior 1 friendship and block fixtures without duplicating the direct thread', async () => {
    const { authority, notificationFacts } = createHarness();
    const friend = SocialRelationshipSnapshotV2Schema.parse(
      readCoreV2Fixture('consumer', 'relationship-friend.json'),
    );
    const blocked = SocialRelationshipSnapshotV2Schema.parse(
      readCoreV2Fixture('consumer', 'relationship-blocked.json'),
    );
    const viewer = actor(friend.viewerPlayerId, 701);
    const target = actor(friend.targetPlayerId, 702);

    const direct = await authority.provisionDirect(viewer, {
      source: {
        sourceType: 'direct_match',
        sourceId: MatchIdSchema.parse(uuid(703)),
        sourceVersion: 1,
      },
      participantPlayerIds: [friend.viewerPlayerId, friend.targetPlayerId],
      metadata: metadata(0, 704, 'provision-direct'),
    });
    const sent = await authority.sendText(viewer, {
      conversationId: direct.conversationId,
      clientMessageId: IdempotencyKeySchema.parse(
        `client-message:${uuid(705)}`,
      ),
      text: 'Message retained for safety evidence.',
      metadata: metadata(1, 706, 'send-message'),
    });
    expect(notificationFacts).toHaveLength(1);

    const friendshipInput = {
      relationship: friend,
      sourceEventId: EventIdSchema.parse(uuid(707)),
      sourceEventVersion: 2 as const,
      correlationId: CorrelationIdSchema.parse(uuid(708)),
      causationId: null,
      occurredAt: '2026-07-14T12:10:00.000Z',
    };
    const friendshipReceipt =
      await authority.applyRelationship(friendshipInput);
    const friendshipReplay = await authority.applyRelationship(friendshipInput);
    expect(friendshipReceipt.conversationId).toBe(direct.conversationId);
    expect(friendshipReceipt.action).toBe('access_reconciled');
    expect(friendshipReplay).toMatchObject({
      conversationId: direct.conversationId,
      repeated: true,
    });
    expect(await authority.listInbox(viewer)).toHaveLength(1);
    expect(
      (await authority.getSources(viewer, direct.conversationId)).map(
        (binding) => binding.source.sourceType,
      ),
    ).toEqual(['direct_match', 'friendship']);

    const accessUpdates: unknown[] = [];
    authority.subscribeAccess(target, direct.conversationId, (access) => {
      accessUpdates.push(access);
    });
    const blockReceipt = await authority.applyRelationship({
      relationship: blocked,
      sourceEventId: EventIdSchema.parse(uuid(709)),
      sourceEventVersion: 2,
      correlationId: CorrelationIdSchema.parse(uuid(710)),
      causationId: EventIdSchema.parse(uuid(707)),
      occurredAt: '2026-07-14T12:11:00.000Z',
    });
    expect(blockReceipt.action).toBe('access_revoked');
    expect(accessUpdates).toContainEqual(
      expect.objectContaining({
        canRead: false,
        canSend: false,
        canSubscribe: false,
        reason: 'blocked',
      }),
    );

    await expect(
      authority.getTimeline(viewer, direct.conversationId),
    ).rejects.toMatchObject({ code: 'conversation_access_revoked' });
    expect(() =>
      authority.subscribeAccess(target, direct.conversationId, jest.fn()),
    ).toThrow(expect.objectContaining({ code: 'conversation_access_revoked' }));
    await expect(
      authority.sendText(viewer, {
        conversationId: direct.conversationId,
        clientMessageId: IdempotencyKeySchema.parse(
          `client-message:${uuid(711)}`,
        ),
        text: 'Blocked send must fail.',
        metadata: metadata(4, 712, 'send-message'),
      }),
    ).rejects.toMatchObject({ code: 'conversation_access_revoked' });
    expect(notificationFacts).toHaveLength(1);

    const evidence = await authority.captureReportEvidence({
      actor: viewer,
      conversationId: direct.conversationId,
      messageId: sent.message!.messageId,
      reportId: 'relationship-block-report-1',
    });
    expect(evidence.message.content).toEqual({
      kind: 'text',
      text: 'Message retained for safety evidence.',
    });
    expect(
      authority
        .events()
        .filter(
          (event) => event.eventType === 'conversation.access_revoked.v2',
        ),
    ).toHaveLength(2);
  });

  it('keeps relationship mute authoritative over conversation-level unmute', async () => {
    const { authority, notificationFacts } = createHarness();
    const friend = SocialRelationshipSnapshotV2Schema.parse(
      readCoreV2Fixture('consumer', 'relationship-friend.json'),
    );
    const viewer = actor(friend.viewerPlayerId, 720);
    const target = actor(friend.targetPlayerId, 721);
    const provisioned = await authority.applyRelationship({
      relationship: friend,
      sourceEventId: EventIdSchema.parse(uuid(722)),
      sourceEventVersion: 2,
      correlationId: CorrelationIdSchema.parse(uuid(723)),
      causationId: null,
      occurredAt: '2026-07-14T12:20:00.000Z',
    });
    const muted = SocialRelationshipSnapshotV2Schema.parse({
      ...friend,
      version: friend.version + 1,
      mute: { viewerMutedTarget: true },
      capabilities: {
        ...friend.capabilities,
        muted: true,
        canMute: false,
        canUnmute: true,
      },
      updatedAt: '2026-07-14T12:21:00.000Z',
    });
    await authority.applyRelationship({
      relationship: muted,
      sourceEventId: EventIdSchema.parse(uuid(724)),
      sourceEventVersion: 2,
      correlationId: CorrelationIdSchema.parse(uuid(725)),
      causationId: EventIdSchema.parse(uuid(722)),
      occurredAt: '2026-07-14T12:21:00.000Z',
    });

    const viewerInbox = await authority.listInbox(viewer);
    expect(viewerInbox[0]).toMatchObject({ muted: true });
    expect(
      await authority.getAccess(viewer, provisioned.conversationId!),
    ).toMatchObject({ canRead: true, canSend: true, canSubscribe: true });
    const snapshot = await authority.getConversation(
      target,
      provisioned.conversationId!,
    );
    await authority.sendText(target, {
      conversationId: provisioned.conversationId!,
      clientMessageId: IdempotencyKeySchema.parse(
        `client-message:${uuid(726)}`,
      ),
      text: 'Muted relationship notification.',
      metadata: metadata(snapshot!.version, 727, 'send-message'),
    });
    expect(notificationFacts).toHaveLength(0);

    const latest = await authority.getConversation(
      viewer,
      provisioned.conversationId!,
    );
    const unmute = await authority.unmute(viewer, {
      conversationId: provisioned.conversationId!,
      metadata: metadata(latest!.version, 728, 'unmute-conversation'),
    });
    expect(unmute.repeated).toBe(true);
    expect((await authority.listInbox(viewer))[0]).toMatchObject({
      muted: true,
    });
  });

  it('rejects a relationship event ID replayed with different facts', async () => {
    const { authority } = createHarness();
    const friend = SocialRelationshipSnapshotV2Schema.parse(
      readCoreV2Fixture('consumer', 'relationship-friend.json'),
    );
    const input = {
      relationship: friend,
      sourceEventId: EventIdSchema.parse(uuid(713)),
      sourceEventVersion: 2 as const,
      correlationId: CorrelationIdSchema.parse(uuid(714)),
      causationId: null,
      occurredAt: '2026-07-14T12:12:00.000Z',
    };
    await authority.applyRelationship(input);

    await expect(
      authority.applyRelationship({
        ...input,
        relationship: { ...friend, version: friend.version + 1 },
      }),
    ).rejects.toMatchObject({ code: 'event_replay_conflict' });
  });
});

function readCoreV2Fixture(
  group: 'provider' | 'consumer',
  name: string,
): unknown {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'contracts/core-v2/fixtures', group, name),
      'utf8',
    ),
  ) as unknown;
}

function authSession(
  state: 'active' | 'suspended',
  messagingAllowed: boolean,
): AuthSession {
  return {
    accessToken: 'access-token',
    expiresAt: 1_800_000_000,
    refreshToken: 'refresh-token',
    tokenType: 'bearer',
    user: { id: uuid(101) },
    principal: {
      accountId: AccountIdSchema.parse(uuid(101)),
      playerId: playerA,
      sessionId: SessionIdSchema.parse(uuid(900)),
      issuedAt: '2026-07-14T11:00:00.000Z',
      expiresAt: '2026-07-14T13:00:00.000Z',
    },
    lifecycle: {
      playerId: playerA,
      profileId: ProfileIdSchema.parse(uuid(901)),
      state,
      version: 7,
      discoverable: false,
      messagingAllowed,
      updatedAt: '2026-07-14T11:00:00.000Z',
    },
  };
}

function uuid(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}
