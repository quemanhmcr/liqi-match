import { describe, expect, it, jest } from '@jest/globals';

import {
  AuthenticatedPrincipalV1Schema,
  CorrelationIdSchema,
  IdempotencyKeySchema,
  MatchIdSchema,
  PlayerIdSchema,
  PlayerLifecycleSnapshotV1Schema,
  type PlayerId,
} from '@/shared/contracts/core-v1';
import {
  PlaySessionIdSchema,
  SessionInviteV2IdSchema,
  type AcceptSessionInviteCommandV2,
  type CreateSessionFromMatchCommandV2,
} from '@/shared/contracts/core-v2';

import { InMemoryPlaySessionService } from '../in-memory-play-session-service';
import { PlaySessionDomainError } from '../play-session-error';
import type {
  PlaySessionActorContext,
  PlaySessionSourceProvider,
  SessionConversationProvisioner,
  SessionParticipantLifecycleProvider,
  SessionRelationshipEligibilityProvider,
} from '../play-session-repository';

const PLAYER_A = PlayerIdSchema.parse('83000000-0000-4000-8000-000000000001');
const PLAYER_B = PlayerIdSchema.parse('83000000-0000-4000-8000-000000000002');
const PLAYER_C = PlayerIdSchema.parse('83000000-0000-4000-8000-000000000003');
const MATCH_ID = MatchIdSchema.parse('83000000-0000-4000-8000-000000000101');
const CONVERSATION_ID = '83000000-0000-4000-8000-000000000201';

function actor(
  playerId: PlayerId,
  state: 'active' | 'suspended' | 'deleted' = 'active',
): PlaySessionActorContext {
  const suffix = playerId.slice(-12);
  return {
    lifecycle: PlayerLifecycleSnapshotV1Schema.parse({
      discoverable: state === 'active',
      messagingAllowed: state === 'active',
      playerId,
      profileId: `84000000-0000-4000-8000-${suffix}`,
      state,
      updatedAt: '2026-07-14T12:00:00.000Z',
      version: 1,
    }),
    principal: AuthenticatedPrincipalV1Schema.parse({
      accountId: `85000000-0000-4000-8000-${suffix}`,
      expiresAt: '2026-07-15T12:00:00.000Z',
      issuedAt: '2026-07-14T11:00:00.000Z',
      playerId,
      sessionId: `86000000-0000-4000-8000-${suffix}`,
    }),
  };
}

function uuidFactory() {
  let value = 300;
  return () => {
    value += 1;
    return `83000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
  };
}

function sourceProvider(
  matchParticipants: readonly PlayerId[] = [PLAYER_A, PLAYER_B],
): PlaySessionSourceProvider {
  return {
    async getMatchParticipantIds(matchId) {
      if (matchId !== MATCH_ID) throw new Error('unknown match');
      return matchParticipants;
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
}

function metadata<const TVersion extends number>(
  id: number,
  expectedVersion: TVersion,
) {
  const suffix = String(id).padStart(12, '0');
  return {
    audit: {
      appVersion: '2.0.0',
      clientCreatedAt: '2026-07-14T12:00:00.000Z',
      clientRequestId: `87000000-0000-4000-8000-${suffix}`,
      platform: 'android' as const,
    },
    correlationId: CorrelationIdSchema.parse(
      `88000000-0000-4000-8000-${suffix}`,
    ),
    expectedVersion,
    idempotencyKey: IdempotencyKeySchema.parse(`session-command.${suffix}`),
  };
}

function createCommand(id = 1): CreateSessionFromMatchCommandV2 {
  return {
    ...metadata(id, 0),
    capacity: 2,
    matchId: MATCH_ID,
    scheduledFor: null,
    timezone: 'Asia/Bangkok',
    title: 'Ranked duo',
  };
}

function createService(
  options: {
    clock?: () => Date;
    conversationProvisioner?: SessionConversationProvisioner;
    lifecycleProvider?: SessionParticipantLifecycleProvider;
    relationshipProvider?: SessionRelationshipEligibilityProvider;
    source?: PlaySessionSourceProvider;
  } = {},
) {
  return new InMemoryPlaySessionService({
    clock: options.clock ?? (() => new Date('2026-07-14T12:00:00.000Z')),
    conversationProvisioner: options.conversationProvisioner,
    createUuid: uuidFactory(),
    lifecycleProvider: options.lifecycleProvider,
    relationshipProvider: options.relationshipProvider,
    sourceProvider: options.source ?? sourceProvider(),
  });
}

function inviteFor(
  service: InMemoryPlaySessionService,
  sessionId: ReturnType<typeof PlaySessionIdSchema.parse>,
  target: PlayerId,
) {
  const invite = service
    .listInvites(sessionId)
    .find((candidate) => candidate.targetPlayerId === target);
  if (!invite) throw new Error(`missing invite for ${target}`);
  return SessionInviteV2IdSchema.parse(invite.id);
}

function acceptCommand(
  id: number,
  expectedVersion: number,
  sessionId: ReturnType<typeof PlaySessionIdSchema.parse>,
  inviteId: ReturnType<typeof SessionInviteV2IdSchema.parse>,
): AcceptSessionInviteCommandV2 {
  return {
    ...metadata(id, expectedVersion),
    inviteId,
    sessionId,
  };
}

describe('InMemoryPlaySessionService walking skeleton', () => {
  it('runs match -> accept -> conversation -> ready -> start -> quorum completion', async () => {
    let current = new Date('2026-07-14T12:00:00.000Z');
    const provision = jest.fn<SessionConversationProvisioner['provision']>(
      async (input) => ({
        conversationId: CONVERSATION_ID as never,
        membership: input.membership,
        sourceAggregateVersion: input.sourceAggregateVersion,
      }),
    );
    const service = createService({
      clock: () => current,
      conversationProvisioner: { provision, reconcile: provision },
    });

    const created = await service.createFromMatch(
      actor(PLAYER_A),
      createCommand(),
    );
    const sessionId = PlaySessionIdSchema.parse(created.aggregateId);
    expect(created.session.state).toBe('recruiting');
    expect(created.session.members).toHaveLength(1);

    const accepted = await service.acceptInvite(
      actor(PLAYER_B),
      acceptCommand(2, 1, sessionId, inviteFor(service, sessionId, PLAYER_B)),
    );
    expect(accepted.aggregateVersion).toBe(2);
    expect(provision).toHaveBeenCalledWith(
      expect.objectContaining({
        membership: {
          members: [
            { playerId: PLAYER_A, role: 'owner' },
            { playerId: PLAYER_B, role: 'member' },
          ],
          membershipVersion: 2,
          sessionId,
        },
        sourceAggregateVersion: 2,
        title: 'Ranked duo',
      }),
    );
    expect(
      (await service.get(actor(PLAYER_A), sessionId)).communication,
    ).toEqual({
      conversationId: CONVERSATION_ID,
      membershipVersion: 2,
      status: 'ready',
    });

    const readyOpened = await service.openReadyCheck(actor(PLAYER_A), {
      ...metadata(3, 2),
      deadlineAt: '2026-07-14T12:05:00.000Z',
      sessionId,
    });
    const checkId = readyOpened.session.readyCheck?.checkId;
    if (!checkId) throw new Error('ready check missing');

    const firstReady = await service.respondReadyCheck(actor(PLAYER_A), {
      ...metadata(4, 3),
      checkId,
      response: 'ready',
      sessionId,
    });
    expect(firstReady.resultCode).toBe('ready_recorded');

    const passed = await service.respondReadyCheck(actor(PLAYER_B), {
      ...metadata(5, 4),
      checkId,
      response: 'ready',
      sessionId,
    });
    expect(passed.resultCode).toBe('ready_check_passed');
    expect(passed.session.state).toBe('scheduled');

    const started = await service.start(actor(PLAYER_A), {
      ...metadata(6, 5),
      sessionId,
    });
    expect(started.session.state).toBe('in_progress');
    current = new Date('2026-07-14T13:00:00.000Z');

    const proposed = await service.proposeCompletion(actor(PLAYER_A), {
      ...metadata(7, 6),
      claim: 'completed',
      reasonCode: null,
      sessionId,
    });
    expect(proposed.resultCode).toBe('completion_pending');

    const completedCommand = {
      ...metadata(8, 7),
      claim: 'completed' as const,
      reasonCode: null,
      sessionId,
    };
    const completed = await service.proposeCompletion(
      actor(PLAYER_B),
      completedCommand,
    );
    expect(completed.resultCode).toBe('completed');
    expect(completed.session.state).toBe('completed');

    const eventTypes = service
      .listEvents(sessionId)
      .map((event) => event.eventType);
    expect(eventTypes).toEqual([
      'session.created.v2',
      'session.invite_created.v2',
      'session.member_joined.v2',
      'session.ready_check_opened.v2',
      'session.member_ready.v2',
      'session.member_ready.v2',
      'session.ready_check_passed.v2',
      'session.scheduled.v2',
      'session.started.v2',
      'session.completion_proposed.v2',
      'session.completion_proposed.v2',
      'session.completed.v2',
    ]);
    expect(service.listEvents(sessionId).at(-1)?.aggregateVersion).toBe(
      completed.aggregateVersion,
    );
    expect(
      service.listEvents(sessionId).map((event) => event.aggregateVersion),
    ).toEqual([1, 1, 2, 3, 4, 5, 5, 5, 6, 7, 8, 8]);

    const beforeReplay = service.listEvents(sessionId).length;
    const replay = await service.proposeCompletion(
      actor(PLAYER_B),
      completedCommand,
    );
    expect(replay.repeated).toBe(true);
    expect(service.listEvents(sessionId)).toHaveLength(beforeReplay);
  });
});

describe('InMemoryPlaySessionService provider invariants', () => {
  it('serializes final-slot accepts so exactly one succeeds', async () => {
    const service = createService();
    const created = await service.createFromMatch(
      actor(PLAYER_A),
      createCommand(),
    );
    const sessionId = PlaySessionIdSchema.parse(created.aggregateId);
    await service.invite(actor(PLAYER_A), {
      ...metadata(9, 1),
      sessionId,
      targetPlayerId: PLAYER_C,
    });

    const outcomes = await Promise.allSettled([
      service.acceptInvite(
        actor(PLAYER_B),
        acceptCommand(
          10,
          2,
          sessionId,
          inviteFor(service, sessionId, PLAYER_B),
        ),
      ),
      service.acceptInvite(
        actor(PLAYER_C),
        acceptCommand(
          11,
          2,
          sessionId,
          inviteFor(service, sessionId, PLAYER_C),
        ),
      ),
    ]);

    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(1);
    expect((await service.getMembership(sessionId)).members).toHaveLength(2);
  });

  it('rejects stale expectedVersion before membership mutation', async () => {
    const service = createService();
    const created = await service.createFromMatch(
      actor(PLAYER_A),
      createCommand(),
    );
    const sessionId = PlaySessionIdSchema.parse(created.aggregateId);

    await expect(
      service.acceptInvite(
        actor(PLAYER_B),
        acceptCommand(
          12,
          99,
          sessionId,
          inviteFor(service, sessionId, PLAYER_B),
        ),
      ),
    ).rejects.toMatchObject({ code: 'version_conflict' });
    expect((await service.getMembership(sessionId)).members).toEqual([
      { playerId: PLAYER_A, role: 'owner' },
    ]);
  });

  it('replays the same invite command and never creates a semantic duplicate', async () => {
    const service = createService();
    const created = await service.createFromMatch(
      actor(PLAYER_A),
      createCommand(),
    );
    const sessionId = PlaySessionIdSchema.parse(created.aggregateId);
    const command = {
      ...metadata(13, 1),
      sessionId,
      targetPlayerId: PLAYER_C,
    };

    const first = await service.invite(actor(PLAYER_A), command);
    const replay = await service.invite(actor(PLAYER_A), command);
    expect(first.eventIds).toHaveLength(1);
    expect(service.listEvents(sessionId).at(-1)?.eventType).toBe(
      'session.invite_created.v2',
    );
    expect(first.repeated).toBe(false);
    expect(replay.repeated).toBe(true);
    expect(
      service
        .listInvites(sessionId)
        .filter((invite) => invite.targetPlayerId === PLAYER_C),
    ).toHaveLength(1);

    await expect(
      service.invite(actor(PLAYER_A), {
        ...metadata(14, 2),
        sessionId,
        targetPlayerId: PLAYER_C,
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('consumes Senior 1 block authority and fails invite closed', async () => {
    const relationshipProvider: SessionRelationshipEligibilityProvider = {
      async getInviteEligibility(_actorPlayerId, targetPlayerId) {
        return targetPlayerId === PLAYER_C
          ? { allowed: false, blocked: true, reasonCodes: ['blocked'] }
          : { allowed: true, blocked: false, reasonCodes: [] };
      },
    };
    const service = createService({ relationshipProvider });
    const created = await service.createFromMatch(
      actor(PLAYER_A),
      createCommand(),
    );
    const sessionId = PlaySessionIdSchema.parse(created.aggregateId);

    await expect(
      service.invite(actor(PLAYER_A), {
        ...metadata(15, 1),
        sessionId,
        targetPlayerId: PLAYER_C,
      }),
    ).rejects.toMatchObject({ code: 'relationship_blocked' });
  });

  it('rejects suspended or deleted participants through Core V1 lifecycle policy', async () => {
    const lifecycleProvider: SessionParticipantLifecycleProvider = {
      async assertActive(playerIds) {
        if (playerIds.includes(PLAYER_C)) {
          throw new PlaySessionDomainError(
            'lifecycle_not_active',
            'Target lifecycle is not active.',
          );
        }
      },
    };
    const service = createService({ lifecycleProvider });
    const created = await service.createFromMatch(
      actor(PLAYER_A),
      createCommand(),
    );
    const sessionId = PlaySessionIdSchema.parse(created.aggregateId);

    await expect(
      service.invite(actor(PLAYER_A), {
        ...metadata(16, 1),
        sessionId,
        targetPlayerId: PLAYER_C,
      }),
    ).rejects.toMatchObject({ code: 'lifecycle_not_active' });
    await expect(
      service.listCurrent(actor(PLAYER_C, 'suspended')),
    ).rejects.toMatchObject({ code: 'lifecycle_not_active' });
  });

  it('recovers a degraded conversation after a retryable provisioning failure', async () => {
    let shouldFail = true;
    const provision = jest.fn<SessionConversationProvisioner['provision']>(
      async (input) => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error('temporary conversation outage');
        }
        return {
          conversationId: CONVERSATION_ID as never,
          membership: input.membership,
          sourceAggregateVersion: input.sourceAggregateVersion,
        };
      },
    );
    const service = createService({
      conversationProvisioner: { provision, reconcile: provision },
    });
    const created = await service.createFromMatch(
      actor(PLAYER_A),
      createCommand(),
    );
    const sessionId = PlaySessionIdSchema.parse(created.aggregateId);

    await service.acceptInvite(
      actor(PLAYER_B),
      acceptCommand(27, 1, sessionId, inviteFor(service, sessionId, PLAYER_B)),
    );
    expect(
      (await service.get(actor(PLAYER_A), sessionId)).communication,
    ).toEqual({
      conversationId: null,
      membershipVersion: 0,
      status: 'degraded',
    });

    await service.reconcileCommunication(
      sessionId,
      metadata(28, 0).correlationId,
    );
    expect(
      (await service.get(actor(PLAYER_A), sessionId)).communication,
    ).toEqual({
      conversationId: CONVERSATION_ID,
      membershipVersion: 2,
      status: 'ready',
    });
    expect(provision).toHaveBeenCalledTimes(2);
  });

  it('reconciles full membership after removal so conversation access can be revoked', async () => {
    const provision = jest.fn<SessionConversationProvisioner['provision']>(
      async (input) => ({
        conversationId: CONVERSATION_ID as never,
        membership: input.membership,
        sourceAggregateVersion: input.sourceAggregateVersion,
      }),
    );
    const reconcile = jest.fn<SessionConversationProvisioner['reconcile']>(
      async (input) => ({
        conversationId: input.conversationId,
        membership: input.membership,
        sourceAggregateVersion: input.sourceAggregateVersion,
      }),
    );
    const service = createService({
      conversationProvisioner: { provision, reconcile },
    });
    const created = await service.createFromMatch(
      actor(PLAYER_A),
      createCommand(),
    );
    const sessionId = PlaySessionIdSchema.parse(created.aggregateId);
    await service.acceptInvite(
      actor(PLAYER_B),
      acceptCommand(29, 1, sessionId, inviteFor(service, sessionId, PLAYER_B)),
    );

    await service.removeMember(actor(PLAYER_A), {
      ...metadata(30, 2),
      memberPlayerId: PLAYER_B,
      reasonCode: 'owner_removed',
      sessionId,
    });

    expect(reconcile).toHaveBeenCalledWith({
      conversationId: CONVERSATION_ID,
      correlationId: metadata(30, 2).correlationId,
      membership: {
        members: [{ playerId: PLAYER_A, role: 'owner' }],
        membershipVersion: 3,
        sessionId,
      },
      sourceAggregateVersion: 3,
      title: 'Ranked duo',
    });
    expect(
      (await service.get(actor(PLAYER_A), sessionId)).communication,
    ).toEqual({
      conversationId: CONVERSATION_ID,
      membershipVersion: 3,
      status: 'ready',
    });
  });

  it('prevents the owner from leaving before transfer or cancellation', async () => {
    const service = createService();
    const created = await service.createFromMatch(
      actor(PLAYER_A),
      createCommand(),
    );
    const sessionId = PlaySessionIdSchema.parse(created.aggregateId);

    await expect(
      service.leave(actor(PLAYER_A), {
        ...metadata(17, 1),
        sessionId,
      }),
    ).rejects.toMatchObject({ code: 'owner_transfer_required' });
  });

  it('expires ready checks deterministically from the injected server clock', async () => {
    let current = new Date('2026-07-14T12:00:00.000Z');
    const sync = async (
      input: Parameters<SessionConversationProvisioner['provision']>[0],
    ) => ({
      conversationId: CONVERSATION_ID as never,
      membership: input.membership,
      sourceAggregateVersion: input.sourceAggregateVersion,
    });
    const provisioner: SessionConversationProvisioner = {
      provision: sync,
      reconcile: sync,
    };
    const service = createService({
      clock: () => current,
      conversationProvisioner: provisioner,
    });
    const created = await service.createFromMatch(
      actor(PLAYER_A),
      createCommand(),
    );
    const sessionId = PlaySessionIdSchema.parse(created.aggregateId);
    await service.acceptInvite(
      actor(PLAYER_B),
      acceptCommand(18, 1, sessionId, inviteFor(service, sessionId, PLAYER_B)),
    );
    const opened = await service.openReadyCheck(actor(PLAYER_A), {
      ...metadata(19, 2),
      deadlineAt: '2026-07-14T12:01:00.000Z',
      sessionId,
    });
    const checkId = opened.session.readyCheck?.checkId;
    if (!checkId) throw new Error('ready check missing');
    current = new Date('2026-07-14T12:01:00.000Z');

    await expect(
      service.respondReadyCheck(actor(PLAYER_A), {
        ...metadata(20, 3),
        checkId,
        response: 'ready',
        sessionId,
      }),
    ).rejects.toMatchObject({ code: 'ready_check_expired' });
    expect(await service.expireReadyChecks(metadata(26, 0).correlationId)).toBe(
      1,
    );
    const session = await service.get(actor(PLAYER_A), sessionId);
    expect(session.state).toBe('recruiting');
    expect(session.readyCheck?.state).toBe('expired');
    expect(service.listEvents(sessionId).at(-1)).toMatchObject({
      aggregateVersion: 4,
      eventType: 'session.ready_check_expired.v2',
    });
  });

  it('emits a versioned outbox fact for an explicit not-ready response', async () => {
    const sync = async (
      input: Parameters<SessionConversationProvisioner['provision']>[0],
    ) => ({
      conversationId: CONVERSATION_ID as never,
      membership: input.membership,
      sourceAggregateVersion: input.sourceAggregateVersion,
    });
    const service = createService({
      conversationProvisioner: { provision: sync, reconcile: sync },
    });
    const created = await service.createFromMatch(
      actor(PLAYER_A),
      createCommand(),
    );
    const sessionId = PlaySessionIdSchema.parse(created.aggregateId);
    await service.acceptInvite(
      actor(PLAYER_B),
      acceptCommand(31, 1, sessionId, inviteFor(service, sessionId, PLAYER_B)),
    );
    const opened = await service.openReadyCheck(actor(PLAYER_A), {
      ...metadata(32, 2),
      deadlineAt: '2026-07-14T12:05:00.000Z',
      sessionId,
    });
    const checkId = opened.session.readyCheck?.checkId;
    if (!checkId) throw new Error('ready check missing');

    const response = await service.respondReadyCheck(actor(PLAYER_B), {
      ...metadata(33, 3),
      checkId,
      response: 'not_ready',
      sessionId,
    });

    expect(response.eventIds).toHaveLength(1);
    expect(service.listEvents(sessionId).at(-1)).toMatchObject({
      aggregateVersion: 4,
      eventType: 'session.member_not_ready.v2',
      payload: { memberPlayerId: PLAYER_B, response: 'not_ready' },
    });
  });

  it('does not let a nonmember answer a ready check', async () => {
    const sync = async (
      input: Parameters<SessionConversationProvisioner['provision']>[0],
    ) => ({
      conversationId: CONVERSATION_ID as never,
      membership: input.membership,
      sourceAggregateVersion: input.sourceAggregateVersion,
    });
    const provisioner: SessionConversationProvisioner = {
      provision: sync,
      reconcile: sync,
    };
    const service = createService({ conversationProvisioner: provisioner });
    const created = await service.createFromMatch(
      actor(PLAYER_A),
      createCommand(),
    );
    const sessionId = PlaySessionIdSchema.parse(created.aggregateId);
    await service.acceptInvite(
      actor(PLAYER_B),
      acceptCommand(21, 1, sessionId, inviteFor(service, sessionId, PLAYER_B)),
    );
    const opened = await service.openReadyCheck(actor(PLAYER_A), {
      ...metadata(22, 2),
      deadlineAt: '2026-07-14T12:05:00.000Z',
      sessionId,
    });
    const checkId = opened.session.readyCheck?.checkId;
    if (!checkId) throw new Error('ready check missing');

    await expect(
      service.respondReadyCheck(actor(PLAYER_C), {
        ...metadata(23, 3),
        checkId,
        response: 'ready',
        sessionId,
      }),
    ).rejects.toMatchObject({ code: 'membership_required' });
  });

  it('fails start and completion closed from invalid states', async () => {
    const service = createService();
    const created = await service.createFromMatch(
      actor(PLAYER_A),
      createCommand(),
    );
    const sessionId = PlaySessionIdSchema.parse(created.aggregateId);

    await expect(
      service.start(actor(PLAYER_A), {
        ...metadata(24, 1),
        sessionId,
      }),
    ).rejects.toMatchObject({ code: 'ready_policy_not_satisfied' });
    await expect(
      service.proposeCompletion(actor(PLAYER_A), {
        ...metadata(25, 1),
        claim: 'completed',
        reasonCode: null,
        sessionId,
      }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
  });

  it('rejects an authenticated principal whose canonical lifecycle is not active', async () => {
    const service = createService();
    await expect(
      service.createFromMatch(actor(PLAYER_A, 'deleted'), createCommand()),
    ).rejects.toMatchObject({ code: 'lifecycle_not_active' });
  });
});
