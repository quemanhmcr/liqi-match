import {
  CoreV2EventSchema,
  PlaySessionCommandReceiptV2Schema,
  PlaySessionMembershipProjectionV2Schema,
  PlaySessionSnapshotV2Schema,
  type CoreV2Event,
  type PlaySessionCommandReceiptV2,
  type PlaySessionId,
  type PlaySessionMembershipProjectionV2,
  type PlaySessionSnapshotV2,
} from '@/shared/contracts/core-v2';
import {
  ConversationIdSchema,
  EventIdSchema,
  PlayerIdSchema,
  type PlayerId,
} from '@/shared/contracts/core-v1';

import { PlaySessionDomainError } from './play-session-error';
import { createRuntimeUuid } from './runtime-uuid';
import type {
  PlaySessionActorContext,
  PlaySessionSourceProvider,
  SessionConversationProvisioner,
  SessionConversationProvisioningReceipt,
  SessionParticipantLifecycleProvider,
  SessionRelationshipEligibilityProvider,
} from './play-session-repository';

export type MutableSession = PlaySessionSnapshotV2;

type SessionInvite = {
  createdAt: string;
  expiresAt: string | null;
  id: string;
  inviterPlayerId: PlayerId;
  sessionId: PlaySessionId;
  state: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  targetPlayerId: PlayerId;
  version: number;
};

type StoredReceipt = {
  requestHash: string;
  receipt: PlaySessionCommandReceiptV2;
};

export type CommandResultCode = PlaySessionCommandReceiptV2['resultCode'];
export type CommandName = PlaySessionCommandReceiptV2['commandName'];

export type InMemoryPlaySessionOptions = Readonly<{
  clock?: () => Date;
  conversationProvisioner?: SessionConversationProvisioner;
  createUuid?: () => string;
  lifecycleProvider?: SessionParticipantLifecycleProvider;
  relationshipProvider?: SessionRelationshipEligibilityProvider;
  sourceProvider: PlaySessionSourceProvider;
}>;

export const terminalSessionStates = new Set<PlaySessionSnapshotV2['state']>([
  'completed',
  'cancelled',
  'expired',
  'abandoned',
  'disputed',
]);

export class InMemoryPlaySessionKernel {
  protected readonly sessions = new Map<PlaySessionId, MutableSession>();
  protected readonly invites = new Map<string, SessionInvite>();
  protected readonly sourceSessions = new Map<string, PlaySessionId>();
  protected readonly receipts = new Map<string, StoredReceipt>();
  protected readonly events: CoreV2Event[] = [];
  protected readonly locks = new Map<string, Promise<void>>();
  protected readonly clock: () => Date;
  protected readonly createUuid: () => string;
  protected readonly relationshipProvider: SessionRelationshipEligibilityProvider;
  protected readonly lifecycleProvider: SessionParticipantLifecycleProvider;
  protected readonly conversationProvisioner?: SessionConversationProvisioner;

  constructor(protected readonly options: InMemoryPlaySessionOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.createUuid = options.createUuid ?? createRuntimeUuid;
    this.relationshipProvider =
      options.relationshipProvider ?? allowAllRelationshipProvider;
    this.lifecycleProvider =
      options.lifecycleProvider ?? allowAllLifecycleProvider;
    this.conversationProvisioner = options.conversationProvisioner;
  }

  listEvents(sessionId?: PlaySessionId) {
    return this.events.filter(
      (event) => !sessionId || event.aggregateId === sessionId,
    );
  }

  listSessionInvites(sessionId: PlaySessionId) {
    return [...this.invites.values()].filter(
      (invite) => invite.sessionId === sessionId,
    );
  }

  async expireReadyChecks(correlationId: string) {
    let expiredCount = 0;
    for (const sessionId of this.sessions.keys()) {
      await this.withLock(`session:${sessionId}`, async () => {
        const session = this.requireSession(sessionId);
        const check = session.readyCheck;
        if (
          session.state !== 'ready_check' ||
          !check ||
          check.state !== 'open' ||
          Date.parse(check.deadlineAt) > this.clock().getTime()
        ) {
          return;
        }
        check.state = 'expired';
        check.version += 1;
        session.state = 'recruiting';
        this.touch(session);
        this.emit(session, null, correlationId, null, {
          eventType: 'session.ready_check_expired.v2',
          payload: {
            checkId: check.checkId,
            expiredAt: this.now(),
            sessionId,
          },
        });
        expiredCount += 1;
      });
    }
    return expiredCount;
  }

  async reconcileCommunication(
    sessionId: PlaySessionId,
    correlationId: string,
  ) {
    if (!this.conversationProvisioner) return;
    const desired = await this.withLock(`session:${sessionId}`, async () => {
      const session = this.requireSession(sessionId);
      return {
        conversationId: session.communication.conversationId,
        membership: projectSessionMembership(session),
        sourceAggregateVersion: session.version,
        title: session.title,
      };
    });
    if (
      desired.conversationId === null &&
      desired.membership.members.length < 2
    ) {
      return;
    }

    let receipt: SessionConversationProvisioningReceipt | undefined;
    try {
      const input = {
        correlationId,
        membership: desired.membership,
        sourceAggregateVersion: desired.sourceAggregateVersion,
        title: desired.title,
      };
      receipt = desired.conversationId
        ? await this.conversationProvisioner.reconcile({
            ...input,
            conversationId: desired.conversationId,
          })
        : await this.conversationProvisioner.provision(input);
    } catch {
      await this.withLock(`session:${sessionId}`, async () => {
        const session = this.requireSession(sessionId);
        if (
          session.membershipVersion === desired.membership.membershipVersion
        ) {
          session.communication.status = 'degraded';
        }
      });
      return;
    }

    await this.withLock(`session:${sessionId}`, async () => {
      const session = this.requireSession(sessionId);
      const currentMembership = projectSessionMembership(session);
      if (
        receipt.sourceAggregateVersion !== desired.sourceAggregateVersion ||
        !sameMembership(currentMembership, desired.membership) ||
        !sameMembership(receipt.membership, desired.membership)
      ) {
        session.communication.status = 'degraded';
        return;
      }
      session.communication = {
        conversationId: ConversationIdSchema.parse(receipt.conversationId),
        membershipVersion: receipt.membership.membershipVersion,
        status: 'ready',
      };
    });
  }

  protected async executeSessionCommand<
    TCommand extends {
      correlationId: string;
      expectedVersion: number;
      idempotencyKey: string;
      sessionId: PlaySessionId;
    },
  >(
    actorPlayerId: PlayerId,
    command: TCommand,
    commandName: CommandName,
    operation: (session: MutableSession) => Promise<{
      eventIds: readonly string[];
      resultCode: CommandResultCode;
    }>,
  ) {
    return await this.execute(
      actorPlayerId,
      command.idempotencyKey,
      commandName,
      command,
      `session:${command.sessionId}`,
      async () => {
        const session = this.requireSession(command.sessionId);
        const result = await operation(session);
        return this.receipt(
          session,
          command.correlationId,
          commandName,
          result.resultCode,
          result.eventIds,
        );
      },
    );
  }

  protected async execute(
    actorPlayerId: PlayerId,
    idempotencyKey: string,
    commandName: CommandName,
    request: unknown,
    lockKey: string,
    operation: () => Promise<PlaySessionCommandReceiptV2>,
  ) {
    return await this.withLock(lockKey, async () => {
      const receiptKey = `${actorPlayerId}:${commandName}:${idempotencyKey}`;
      const requestHash = stableSerialize(request);
      const stored = this.receipts.get(receiptKey);
      if (stored) {
        if (stored.requestHash !== requestHash) {
          throw new PlaySessionDomainError(
            'idempotency_key_reused',
            'The idempotency key was reused for a different request.',
          );
        }
        return PlaySessionCommandReceiptV2Schema.parse({
          ...stored.receipt,
          repeated: true,
        });
      }
      const receipt = PlaySessionCommandReceiptV2Schema.parse(
        await operation(),
      );
      this.receipts.set(receiptKey, { receipt, requestHash });
      return receipt;
    });
  }

  protected async withLock<T>(key: string, operation: () => Promise<T>) {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.locks.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(key) === tail) this.locks.delete(key);
    }
  }

  protected requireActor(actor: PlaySessionActorContext) {
    const { lifecycle, principal } = actor;
    if (!principal.playerId) {
      throw new PlaySessionDomainError(
        'lifecycle_not_active',
        'The authenticated account has no canonical Player identity.',
      );
    }
    if (Date.parse(principal.expiresAt) <= this.clock().getTime()) {
      throw new PlaySessionDomainError(
        'session_expired',
        'Session has expired.',
      );
    }
    if (
      lifecycle.playerId !== principal.playerId ||
      lifecycle.state !== 'active'
    ) {
      throw new PlaySessionDomainError(
        'lifecycle_not_active',
        'Player lifecycle is not active.',
        { state: lifecycle.state },
      );
    }
    return PlayerIdSchema.parse(principal.playerId);
  }

  protected requireSession(sessionId: PlaySessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new PlaySessionDomainError(
        'not_found',
        'Play Session was not found.',
      );
    }
    return session;
  }

  protected requireActiveMember(session: MutableSession, playerId: PlayerId) {
    const member = session.members.find(
      (candidate) =>
        candidate.playerId === playerId && candidate.state === 'active',
    );
    if (!member) {
      throw new PlaySessionDomainError(
        'membership_required',
        'Active Session membership is required.',
      );
    }
    return member;
  }

  protected requireHistoricalMember(
    session: MutableSession,
    playerId: PlayerId,
  ) {
    if (!this.isHistoricalMember(session, playerId)) {
      throw new PlaySessionDomainError(
        'forbidden',
        'The actor has no Session membership history.',
      );
    }
  }

  protected isHistoricalMember(session: MutableSession, playerId: PlayerId) {
    return session.members.some((member) => member.playerId === playerId);
  }

  protected isActiveMember(session: MutableSession, playerId: PlayerId) {
    return session.members.some(
      (member) => member.playerId === playerId && member.state === 'active',
    );
  }

  protected activeParticipantIds(session: MutableSession) {
    return session.members
      .filter((member) => member.state === 'active')
      .map((member) => member.playerId);
  }

  protected assertExpectedVersion(
    session: MutableSession,
    expectedVersion: number,
  ) {
    if (session.version !== expectedVersion) {
      throw new PlaySessionDomainError(
        'version_conflict',
        'Play Session version changed.',
        { actualVersion: session.version, expectedVersion },
      );
    }
  }

  protected assertOwner(session: MutableSession, actorPlayerId: PlayerId) {
    if (
      session.ownerPlayerId !== actorPlayerId ||
      !this.isActiveMember(session, actorPlayerId)
    ) {
      throw new PlaySessionDomainError(
        'forbidden',
        'Only the active Session owner may perform this command.',
      );
    }
  }

  protected assertRecruiting(session: MutableSession) {
    if (session.state !== 'recruiting') {
      throw new PlaySessionDomainError(
        'invalid_transition',
        'Session membership can change only while recruiting.',
      );
    }
  }

  protected assertMutableMembershipState(session: MutableSession) {
    if (
      !['draft', 'recruiting', 'ready_check', 'scheduled'].includes(
        session.state,
      )
    ) {
      throw new PlaySessionDomainError(
        'invalid_transition',
        'Session membership cannot change in the current state.',
      );
    }
  }

  protected hasCapacity(session: MutableSession) {
    return this.activeParticipantIds(session).length < session.capacity;
  }

  protected assertCapacityAvailable(session: MutableSession) {
    if (!this.hasCapacity(session)) {
      throw new PlaySessionDomainError(
        'capacity_exceeded',
        'Play Session capacity has been reached.',
      );
    }
  }

  protected invalidateReadyCheck(session: MutableSession) {
    if (!session.readyCheck) return;
    session.readyCheck.state = 'cancelled';
    session.readyCheck.version += 1;
    session.state = 'recruiting';
  }

  protected touch(session: MutableSession) {
    session.version += 1;
    session.updatedAt = this.now();
  }

  protected receipt(
    session: MutableSession,
    correlationId: string,
    commandName: CommandName,
    resultCode: CommandResultCode,
    eventIds: readonly string[],
  ) {
    return PlaySessionCommandReceiptV2Schema.parse({
      aggregateId: session.sessionId,
      aggregateType: 'play_session',
      aggregateVersion: session.version,
      commandName,
      correlationId,
      eventIds,
      occurredAt: this.now(),
      repeated: false,
      resultCode,
      session: snapshotSession(session),
    });
  }

  protected emit(
    session: MutableSession,
    actorPlayerId: PlayerId | null,
    correlationId: string,
    causationId: string | null,
    event: Readonly<{ eventType: string; payload: unknown }>,
  ) {
    const envelope = CoreV2EventSchema.parse({
      actorPlayerId,
      aggregateId: session.sessionId,
      aggregateType: 'play_session',
      aggregateVersion: session.version,
      causationId: causationId ? EventIdSchema.parse(causationId) : null,
      correlationId,
      eventId: EventIdSchema.parse(this.createUuid()),
      eventType: event.eventType,
      eventVersion: 2,
      occurredAt: this.now(),
      payload: event.payload,
    });
    this.events.push(envelope);
    return envelope;
  }

  protected async assertInviteAllowed(
    actorPlayerId: PlayerId,
    targetPlayerId: PlayerId,
  ) {
    const eligibility = await this.relationshipProvider.getInviteEligibility(
      actorPlayerId,
      targetPlayerId,
    );
    if (!eligibility.allowed) {
      throw new PlaySessionDomainError(
        eligibility.blocked ? 'relationship_blocked' : 'invitation_not_allowed',
        'Relationship authority denied the Session invitation.',
        { reasonCodes: eligibility.reasonCodes },
      );
    }
  }

  protected async assertPairwiseSessionEligibility(
    playerIds: readonly PlayerId[],
  ) {
    for (let index = 0; index < playerIds.length; index += 1) {
      for (
        let targetIndex = index + 1;
        targetIndex < playerIds.length;
        targetIndex += 1
      ) {
        const actor = playerIds[index];
        const target = playerIds[targetIndex];
        if (!actor || !target) continue;
        await this.assertInviteAllowed(actor, target);
        await this.assertInviteAllowed(target, actor);
      }
    }
  }

  protected now() {
    return this.clock().toISOString();
  }
}

export function snapshotSession(
  session: MutableSession,
): PlaySessionSnapshotV2 {
  return PlaySessionSnapshotV2Schema.parse(structuredClone(session));
}

export function projectSessionMembership(
  session: MutableSession,
): PlaySessionMembershipProjectionV2 {
  return PlaySessionMembershipProjectionV2Schema.parse({
    members: session.members
      .filter((member) => member.state === 'active')
      .map(({ playerId, role }) => ({ playerId, role })),
    membershipVersion: session.membershipVersion,
    sessionId: session.sessionId,
  });
}

function sameMembership(
  left: PlaySessionMembershipProjectionV2,
  right: PlaySessionMembershipProjectionV2,
) {
  return stableSerialize(left) === stableSerialize(right);
}

export function uniquePlayers(playerIds: readonly PlayerId[]) {
  return [...new Set(playerIds)].map((playerId) =>
    PlayerIdSchema.parse(playerId),
  );
}

export function samePlayers(
  left: readonly PlayerId[],
  right: readonly PlayerId[],
) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((playerId) => rightSet.has(playerId));
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

const allowAllRelationshipProvider: SessionRelationshipEligibilityProvider = {
  async getInviteEligibility() {
    return { allowed: true, blocked: false, reasonCodes: [] };
  },
};

const allowAllLifecycleProvider: SessionParticipantLifecycleProvider = {
  async assertActive() {},
};
