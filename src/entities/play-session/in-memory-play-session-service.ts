import {
  AcceptSessionInviteCommandV2Schema,
  AssignSessionRoleCommandV2Schema,
  CancelSessionCommandV2Schema,
  CreatePlaySessionCommandV2Schema,
  CreateSessionFromMatchCommandV2Schema,
  CreateSessionFromSetCommandV2Schema,
  DeclineSessionInviteCommandV2Schema,
  InviteToSessionCommandV2Schema,
  LeaveSessionCommandV2Schema,
  OpenReadyCheckCommandV2Schema,
  PlaySessionCapabilitiesV2Schema,
  PlaySessionIdSchema,
  PlaySessionInviteProjectionV2Schema,
  ProposeSessionCompletionCommandV2Schema,
  RemoveSessionMemberCommandV2Schema,
  RespondReadyCheckCommandV2Schema,
  ScheduleSessionCommandV2Schema,
  StartSessionCommandV2Schema,
  SessionInviteV2IdSchema,
  type PlaySessionCommandReceiptV2,
  type PlaySessionId,
} from '@/shared/contracts/core-v2';

import {
  InMemoryPlaySessionKernel,
  projectSessionMembership,
  samePlayers,
  snapshotSession,
  terminalSessionStates,
  uniquePlayers,
  type CommandResultCode,
  type MutableSession,
} from './in-memory-play-session-kernel';
import { PlaySessionDomainError } from './play-session-error';
import type {
  PlaySessionActorContext,
  PlaySessionCapabilitiesProvider,
  PlaySessionCommandService,
  PlaySessionEventLog,
  PlaySessionMaintenanceService,
  PlaySessionRepository,
  SessionMembershipProvider,
} from './play-session-repository';

export class InMemoryPlaySessionService
  extends InMemoryPlaySessionKernel
  implements
    PlaySessionRepository,
    PlaySessionCommandService,
    PlaySessionCapabilitiesProvider,
    SessionMembershipProvider,
    PlaySessionMaintenanceService,
    PlaySessionEventLog
{
  async get(actor: PlaySessionActorContext, sessionId: PlaySessionId) {
    const actorPlayerId = this.requireActor(actor);
    const session = this.requireSession(sessionId);
    this.requireHistoricalMember(session, actorPlayerId);
    return snapshotSession(session);
  }

  async listCurrent(actor: PlaySessionActorContext) {
    const actorPlayerId = this.requireActor(actor);
    return [...this.sessions.values()]
      .filter((session) =>
        session.members.some(
          (member) =>
            member.playerId === actorPlayerId && member.state === 'active',
        ),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(snapshotSession);
  }

  async listInvites(actor: PlaySessionActorContext, limit = 20) {
    const actorPlayerId = this.requireActor(actor);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new PlaySessionDomainError(
        'validation_failed',
        'Session invite list limit must be between 1 and 50.',
      );
    }
    const now = this.clock().getTime();
    return [...this.invites.values()]
      .filter((invite) => {
        const session = this.sessions.get(invite.sessionId);
        return (
          invite.targetPlayerId === actorPlayerId &&
          invite.state === 'pending' &&
          (invite.expiresAt === null || Date.parse(invite.expiresAt) > now) &&
          session?.state === 'recruiting'
        );
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((invite) =>
        PlaySessionInviteProjectionV2Schema.parse({
          createdAt: invite.createdAt,
          expiresAt: invite.expiresAt,
          inviteId: invite.id,
          inviterPlayerId: invite.inviterPlayerId,
          session: snapshotSession(this.requireSession(invite.sessionId)),
          sessionId: invite.sessionId,
          state: invite.state,
          targetPlayerId: invite.targetPlayerId,
          version: invite.version,
        }),
      );
  }

  async create(
    actor: PlaySessionActorContext,
    rawCommand: unknown,
  ): Promise<PlaySessionCommandReceiptV2> {
    const command = CreatePlaySessionCommandV2Schema.parse(rawCommand);
    const actorPlayerId = this.requireActor(actor);
    return await this.execute(
      actorPlayerId,
      command.idempotencyKey,
      'create_play_session_v2',
      command,
      `manual:${actorPlayerId}:${command.idempotencyKey}`,
      async () => {
        const inviteePlayerIds = uniquePlayers(command.initialInviteePlayerIds);
        if (inviteePlayerIds.includes(actorPlayerId)) {
          throw new PlaySessionDomainError(
            'validation_failed',
            'The Session owner cannot be an initial invitee.',
          );
        }
        if (inviteePlayerIds.length > command.capacity - 1) {
          throw new PlaySessionDomainError(
            'capacity_exceeded',
            'Initial invitees exceed Session capacity.',
          );
        }
        await this.lifecycleProvider.assertActive(inviteePlayerIds);
        for (const targetPlayerId of inviteePlayerIds) {
          await this.assertInviteAllowed(actorPlayerId, targetPlayerId);
        }
        const now = this.now();
        const sessionId = PlaySessionIdSchema.parse(this.createUuid());
        const session: MutableSession = {
          cancellationReason: null,
          cancelledAt: null,
          capacity: command.capacity,
          communication: {
            conversationId: null,
            membershipVersion: 0,
            status: 'pending',
          },
          completedAt: null,
          completionClaims: [],
          createdAt: now,
          members: [
            {
              joinedAt: now,
              leftAt: null,
              playerId: actorPlayerId,
              role: 'owner',
              state: 'active',
            },
          ],
          membershipVersion: 1,
          ownerPlayerId: actorPlayerId,
          readyCheck: null,
          roleAssignments: [],
          scheduledFor: command.scheduledFor,
          sessionId,
          source: { kind: 'manual' },
          startedAt: null,
          state: 'recruiting',
          timezone: command.timezone,
          title: command.title,
          updatedAt: now,
          version: 1,
        };
        this.sessions.set(sessionId, session);
        const createdEvent = this.emit(
          session,
          actorPlayerId,
          command.correlationId,
          null,
          {
            eventType: 'session.created.v2',
            payload: {
              communicationProvisioningRequired: false,
              membership: projectSessionMembership(session),
              session: snapshotSession(session),
            },
          },
        );
        const eventIds = [createdEvent.eventId];
        for (const targetPlayerId of inviteePlayerIds) {
          const inviteId = SessionInviteV2IdSchema.parse(this.createUuid());
          this.invites.set(inviteId, {
            createdAt: now,
            expiresAt: null,
            id: inviteId,
            inviterPlayerId: actorPlayerId,
            sessionId,
            state: 'pending',
            targetPlayerId,
            version: 1,
          });
          const event = this.emit(
            session,
            actorPlayerId,
            command.correlationId,
            createdEvent.eventId,
            {
              eventType: 'session.invite_created.v2',
              payload: {
                actorPlayerId,
                inviteId,
                sessionId,
                targetPlayerId,
              },
            },
          );
          eventIds.push(event.eventId);
        }
        return this.receipt(
          session,
          command.correlationId,
          'create_play_session_v2',
          'created',
          eventIds,
        );
      },
    );
  }

  async createFromMatch(
    actor: PlaySessionActorContext,
    rawCommand: unknown,
  ): Promise<PlaySessionCommandReceiptV2> {
    const command = CreateSessionFromMatchCommandV2Schema.parse(rawCommand);
    const actorPlayerId = this.requireActor(actor);
    const sourceKey = `match:${command.matchId}`;
    const receipt = await this.execute(
      actorPlayerId,
      command.idempotencyKey,
      'create_session_from_match_v2',
      command,
      sourceKey,
      async () => {
        if (this.sourceSessions.has(sourceKey)) {
          throw new PlaySessionDomainError(
            'invalid_transition',
            'The Match already has a Play Session.',
          );
        }
        const participantIds = uniquePlayers(
          await this.options.sourceProvider.getMatchParticipantIds(
            command.matchId,
          ),
        );
        if (
          participantIds.length !== 2 ||
          !participantIds.includes(actorPlayerId)
        ) {
          throw new PlaySessionDomainError(
            'forbidden',
            'The actor is not a participant of this authoritative Match.',
          );
        }
        await this.lifecycleProvider.assertActive(participantIds);
        const otherPlayerId = participantIds.find(
          (playerId) => playerId !== actorPlayerId,
        );
        if (!otherPlayerId) {
          throw new PlaySessionDomainError(
            'internal_error',
            'The Match participant projection is invalid.',
          );
        }
        await this.assertInviteAllowed(actorPlayerId, otherPlayerId);

        const now = this.now();
        const sessionId = PlaySessionIdSchema.parse(this.createUuid());
        const inviteId = this.createUuid();
        const session: MutableSession = {
          cancellationReason: null,
          cancelledAt: null,
          capacity: 2,
          communication: {
            conversationId: null,
            membershipVersion: 0,
            status: 'pending',
          },
          completedAt: null,
          completionClaims: [],
          createdAt: now,
          members: [
            {
              joinedAt: now,
              leftAt: null,
              playerId: actorPlayerId,
              role: 'owner',
              state: 'active',
            },
          ],
          membershipVersion: 1,
          ownerPlayerId: actorPlayerId,
          readyCheck: null,
          roleAssignments: [],
          scheduledFor: command.scheduledFor,
          sessionId,
          source: { kind: 'match', matchId: command.matchId },
          startedAt: null,
          state: 'recruiting',
          timezone: command.timezone,
          title: command.title,
          updatedAt: now,
          version: 1,
        };
        this.sessions.set(sessionId, session);
        this.sourceSessions.set(sourceKey, sessionId);
        this.invites.set(inviteId, {
          createdAt: now,
          expiresAt: null,
          id: inviteId,
          inviterPlayerId: actorPlayerId,
          sessionId,
          state: 'pending',
          targetPlayerId: otherPlayerId,
          version: 1,
        });
        const createdEvent = this.emit(
          session,
          actorPlayerId,
          command.correlationId,
          null,
          {
            eventType: 'session.created.v2',
            payload: {
              communicationProvisioningRequired: false,
              membership: projectSessionMembership(session),
              session: snapshotSession(session),
            },
          },
        );
        const inviteEvent = this.emit(
          session,
          actorPlayerId,
          command.correlationId,
          createdEvent.eventId,
          {
            eventType: 'session.invite_created.v2',
            payload: {
              actorPlayerId,
              inviteId,
              sessionId,
              targetPlayerId: otherPlayerId,
            },
          },
        );
        return this.receipt(
          session,
          command.correlationId,
          'create_session_from_match_v2',
          'created',
          [createdEvent.eventId, inviteEvent.eventId],
        );
      },
    );
    return receipt;
  }

  async createFromSet(
    actor: PlaySessionActorContext,
    rawCommand: unknown,
  ): Promise<PlaySessionCommandReceiptV2> {
    const command = CreateSessionFromSetCommandV2Schema.parse(rawCommand);
    const actorPlayerId = this.requireActor(actor);
    const sourceKey = `set:${command.setId}`;
    const receipt = await this.execute(
      actorPlayerId,
      command.idempotencyKey,
      'create_session_from_set_v2',
      command,
      sourceKey,
      async () => {
        if (this.sourceSessions.has(sourceKey)) {
          throw new PlaySessionDomainError(
            'invalid_transition',
            'The Set already has a Play Session.',
          );
        }
        const set = await this.options.sourceProvider.getSetSnapshot(
          command.setId,
        );
        if (set.version !== command.expectedSourceVersion) {
          throw new PlaySessionDomainError(
            'version_conflict',
            'The Set version changed before Session conversion.',
            {
              actualVersion: set.version,
              expectedVersion: command.expectedSourceVersion,
            },
          );
        }
        if (set.ownerPlayerId !== actorPlayerId) {
          throw new PlaySessionDomainError(
            'forbidden',
            'Only the Set owner can convert it into a Play Session.',
          );
        }
        const participantIds = uniquePlayers(set.memberPlayerIds);
        await this.lifecycleProvider.assertActive(participantIds);
        await this.assertPairwiseSessionEligibility(participantIds);
        const now = this.now();
        const sessionId = PlaySessionIdSchema.parse(this.createUuid());
        const session: MutableSession = {
          cancellationReason: null,
          cancelledAt: null,
          capacity: set.capacity,
          communication: {
            conversationId: null,
            membershipVersion: 0,
            status: 'pending',
          },
          completedAt: null,
          completionClaims: [],
          createdAt: now,
          members: participantIds.map((playerId) => ({
            joinedAt: now,
            leftAt: null,
            playerId,
            role: playerId === actorPlayerId ? 'owner' : 'member',
            state: 'active' as const,
          })),
          membershipVersion: 1,
          ownerPlayerId: actorPlayerId,
          readyCheck: null,
          roleAssignments: [],
          scheduledFor: command.scheduledFor,
          sessionId,
          source: { kind: 'set', setId: command.setId },
          startedAt: null,
          state: participantIds.length >= 2 ? 'recruiting' : 'draft',
          timezone: command.timezone,
          title: command.title,
          updatedAt: now,
          version: 1,
        };
        this.sessions.set(sessionId, session);
        this.sourceSessions.set(sourceKey, sessionId);
        const event = this.emit(
          session,
          actorPlayerId,
          command.correlationId,
          null,
          {
            eventType: 'session.created.v2',
            payload: {
              communicationProvisioningRequired: participantIds.length >= 2,
              membership: projectSessionMembership(session),
              session: snapshotSession(session),
            },
          },
        );
        const result = this.receipt(
          session,
          command.correlationId,
          'create_session_from_set_v2',
          'created',
          [event.eventId],
        );
        return result;
      },
    );
    await this.reconcileCommunication(
      PlaySessionIdSchema.parse(receipt.aggregateId),
      command.correlationId,
    );
    return receipt;
  }
  async invite(actor: PlaySessionActorContext, rawCommand: unknown) {
    const command = InviteToSessionCommandV2Schema.parse(rawCommand);
    const actorPlayerId = this.requireActor(actor);
    return await this.executeSessionCommand(
      actorPlayerId,
      command,
      'invite_to_session_v2',
      async (session) => {
        this.assertExpectedVersion(session, command.expectedVersion);
        this.assertOwner(session, actorPlayerId);
        this.assertRecruiting(session);
        this.assertCapacityAvailable(session);
        if (this.isHistoricalMember(session, command.targetPlayerId)) {
          throw new PlaySessionDomainError(
            'validation_failed',
            'The target already has Session membership history.',
          );
        }
        if (
          [...this.invites.values()].some(
            (invite) =>
              invite.sessionId === session.sessionId &&
              invite.targetPlayerId === command.targetPlayerId &&
              invite.state === 'pending',
          )
        ) {
          throw new PlaySessionDomainError(
            'validation_failed',
            'A pending invite already exists for this player.',
          );
        }
        await this.lifecycleProvider.assertActive([command.targetPlayerId]);
        await this.assertInviteAllowed(actorPlayerId, command.targetPlayerId);
        const inviteId = SessionInviteV2IdSchema.parse(this.createUuid());
        this.invites.set(inviteId, {
          createdAt: this.now(),
          expiresAt: null,
          id: inviteId,
          inviterPlayerId: actorPlayerId,
          sessionId: session.sessionId,
          state: 'pending',
          targetPlayerId: command.targetPlayerId,
          version: 1,
        });
        this.touch(session);
        const event = this.emit(
          session,
          actorPlayerId,
          command.correlationId,
          null,
          {
            eventType: 'session.invite_created.v2',
            payload: {
              actorPlayerId,
              inviteId,
              sessionId: session.sessionId,
              targetPlayerId: command.targetPlayerId,
            },
          },
        );
        return {
          eventIds: [event.eventId],
          resultCode: 'invite_pending' as const,
        };
      },
    );
  }

  async acceptInvite(actor: PlaySessionActorContext, rawCommand: unknown) {
    const command = AcceptSessionInviteCommandV2Schema.parse(rawCommand);
    const actorPlayerId = this.requireActor(actor);
    const receipt = await this.executeSessionCommand(
      actorPlayerId,
      command,
      'accept_session_invite_v2',
      async (session) => {
        this.assertExpectedVersion(session, command.expectedVersion);
        this.assertRecruiting(session);
        this.assertCapacityAvailable(session);
        const invite = this.invites.get(command.inviteId);
        if (
          !invite ||
          invite.sessionId !== session.sessionId ||
          invite.targetPlayerId !== actorPlayerId
        ) {
          throw new PlaySessionDomainError(
            'not_found',
            'Session invite was not found.',
          );
        }
        if (invite.state !== 'pending') {
          throw new PlaySessionDomainError(
            'invalid_transition',
            'Session invite is no longer pending.',
          );
        }
        await this.assertPairwiseSessionEligibility([
          ...this.activeParticipantIds(session),
          actorPlayerId,
        ]);
        invite.state = 'accepted';
        invite.version += 1;
        const now = this.now();
        session.members.push({
          joinedAt: now,
          leftAt: null,
          playerId: actorPlayerId,
          role: 'member',
          state: 'active',
        });
        session.membershipVersion += 1;
        this.touch(session);
        const event = this.emit(
          session,
          actorPlayerId,
          command.correlationId,
          null,
          {
            eventType: 'session.member_joined.v2',
            payload: {
              communicationProvisioningRequired:
                this.activeParticipantIds(session).length >= 2,
              memberPlayerId: actorPlayerId,
              membership: projectSessionMembership(session),
              sessionId: session.sessionId,
            },
          },
        );
        return {
          eventIds: [event.eventId],
          resultCode: 'invite_accepted' as const,
        };
      },
    );
    await this.reconcileCommunication(command.sessionId, command.correlationId);
    return receipt;
  }

  async declineInvite(actor: PlaySessionActorContext, rawCommand: unknown) {
    const command = DeclineSessionInviteCommandV2Schema.parse(rawCommand);
    const actorPlayerId = this.requireActor(actor);
    return await this.executeSessionCommand(
      actorPlayerId,
      command,
      'decline_session_invite_v2',
      async (session) => {
        this.assertExpectedVersion(session, command.expectedVersion);
        this.assertRecruiting(session);
        const invite = this.invites.get(command.inviteId);
        if (
          !invite ||
          invite.sessionId !== session.sessionId ||
          invite.targetPlayerId !== actorPlayerId
        ) {
          throw new PlaySessionDomainError(
            'not_found',
            'Session invite was not found.',
          );
        }
        if (invite.state !== 'pending') {
          throw new PlaySessionDomainError(
            'invalid_transition',
            'Session invite is no longer pending.',
          );
        }
        if (
          invite.expiresAt &&
          Date.parse(invite.expiresAt) <= this.clock().getTime()
        ) {
          throw new PlaySessionDomainError(
            'invalid_transition',
            'Session invite has expired.',
          );
        }
        invite.state = 'declined';
        invite.version += 1;
        this.touch(session);
        const event = this.emit(
          session,
          actorPlayerId,
          command.correlationId,
          null,
          {
            eventType: 'session.invite_declined.v2',
            payload: {
              inviteId: command.inviteId,
              sessionId: session.sessionId,
              targetPlayerId: actorPlayerId,
            },
          },
        );
        return {
          eventIds: [event.eventId],
          resultCode: 'invite_declined' as const,
        };
      },
    );
  }

  async leave(actor: PlaySessionActorContext, rawCommand: unknown) {
    const command = LeaveSessionCommandV2Schema.parse(rawCommand);
    const actorPlayerId = this.requireActor(actor);
    const receipt = await this.executeSessionCommand(
      actorPlayerId,
      command,
      'leave_session_v2',
      async (session) => {
        this.assertExpectedVersion(session, command.expectedVersion);
        if (session.ownerPlayerId === actorPlayerId) {
          throw new PlaySessionDomainError(
            'owner_transfer_required',
            'The owner must transfer ownership or cancel the Session before leaving.',
          );
        }
        this.assertMutableMembershipState(session);
        const member = this.requireActiveMember(session, actorPlayerId);
        member.state = 'left';
        member.leftAt = this.now();
        session.membershipVersion += 1;
        this.invalidateReadyCheck(session);
        this.touch(session);
        const event = this.emit(
          session,
          actorPlayerId,
          command.correlationId,
          null,
          {
            eventType: 'session.member_left.v2',
            payload: {
              memberPlayerId: actorPlayerId,
              membership: projectSessionMembership(session),
              reasonCode: 'member_left',
              sessionId: session.sessionId,
            },
          },
        );
        return {
          eventIds: [event.eventId],
          resultCode: 'member_left' as const,
        };
      },
    );
    await this.reconcileCommunication(command.sessionId, command.correlationId);
    return receipt;
  }

  async removeMember(actor: PlaySessionActorContext, rawCommand: unknown) {
    const command = RemoveSessionMemberCommandV2Schema.parse(rawCommand);
    const actorPlayerId = this.requireActor(actor);
    const receipt = await this.executeSessionCommand(
      actorPlayerId,
      command,
      'remove_session_member_v2',
      async (session) => {
        this.assertExpectedVersion(session, command.expectedVersion);
        this.assertOwner(session, actorPlayerId);
        this.assertMutableMembershipState(session);
        if (command.memberPlayerId === actorPlayerId) {
          throw new PlaySessionDomainError(
            'validation_failed',
            'The owner cannot remove themselves.',
          );
        }
        const member = this.requireActiveMember(
          session,
          command.memberPlayerId,
        );
        member.state = 'removed';
        member.leftAt = this.now();
        session.membershipVersion += 1;
        this.invalidateReadyCheck(session);
        this.touch(session);
        const event = this.emit(
          session,
          actorPlayerId,
          command.correlationId,
          null,
          {
            eventType: 'session.member_left.v2',
            payload: {
              memberPlayerId: command.memberPlayerId,
              membership: projectSessionMembership(session),
              reasonCode: command.reasonCode,
              sessionId: session.sessionId,
            },
          },
        );
        return {
          eventIds: [event.eventId],
          resultCode: 'member_removed' as const,
        };
      },
    );
    await this.reconcileCommunication(command.sessionId, command.correlationId);
    return receipt;
  }

  async assignRole(actor: PlaySessionActorContext, rawCommand: unknown) {
    const command = AssignSessionRoleCommandV2Schema.parse(rawCommand);
    const actorPlayerId = this.requireActor(actor);
    return await this.executeSessionCommand(
      actorPlayerId,
      command,
      'assign_session_role_v2',
      async (session) => {
        this.assertExpectedVersion(session, command.expectedVersion);
        this.assertOwner(session, actorPlayerId);
        this.assertMutableMembershipState(session);
        this.requireActiveMember(session, command.memberPlayerId);
        const assignment = {
          assignedAt: this.now(),
          assignmentId: this.createUuid() as never,
          playerId: command.memberPlayerId,
          roleSlug: command.roleSlug,
        };
        session.roleAssignments = [
          ...session.roleAssignments.filter(
            (current) => current.playerId !== command.memberPlayerId,
          ),
          assignment,
        ];
        this.invalidateReadyCheck(session);
        this.touch(session);
        const event = this.emit(
          session,
          actorPlayerId,
          command.correlationId,
          null,
          {
            eventType: 'session.role_assigned.v2',
            payload: { assignment, sessionId: session.sessionId },
          },
        );
        return {
          eventIds: [event.eventId],
          resultCode: 'role_assigned' as const,
        };
      },
    );
  }

  async openReadyCheck(actor: PlaySessionActorContext, rawCommand: unknown) {
    const command = OpenReadyCheckCommandV2Schema.parse(rawCommand);
    const actorPlayerId = this.requireActor(actor);
    return await this.executeSessionCommand(
      actorPlayerId,
      command,
      'open_ready_check_v2',
      async (session) => {
        this.assertExpectedVersion(session, command.expectedVersion);
        this.assertOwner(session, actorPlayerId);
        if (!['recruiting', 'scheduled'].includes(session.state)) {
          throw new PlaySessionDomainError(
            'invalid_transition',
            'Ready check can open only from recruiting or scheduled state.',
          );
        }
        const activePlayerIds = this.activeParticipantIds(session);
        if (activePlayerIds.length < 2) {
          throw new PlaySessionDomainError(
            'ready_policy_not_satisfied',
            'At least two active participants are required.',
          );
        }
        if (session.communication.status !== 'ready') {
          throw new PlaySessionDomainError(
            'conversation_pending',
            'The Session conversation is not provisioned yet.',
            { status: session.communication.status },
          );
        }
        const deadlineMs = Date.parse(command.deadlineAt);
        if (deadlineMs <= this.clock().getTime()) {
          throw new PlaySessionDomainError(
            'validation_failed',
            'Ready-check deadline must be in the future.',
          );
        }
        session.readyCheck = {
          checkId: this.createUuid() as never,
          deadlineAt: command.deadlineAt,
          openedAt: this.now(),
          requiredPlayerIds: activePlayerIds,
          responses: [],
          state: 'open',
          version: 1,
        };
        session.state = 'ready_check';
        this.touch(session);
        const event = this.emit(
          session,
          actorPlayerId,
          command.correlationId,
          null,
          {
            eventType: 'session.ready_check_opened.v2',
            payload: {
              readyCheck: session.readyCheck,
              sessionId: session.sessionId,
            },
          },
        );
        return {
          eventIds: [event.eventId],
          resultCode: 'ready_check_opened' as const,
        };
      },
    );
  }

  async respondReadyCheck(actor: PlaySessionActorContext, rawCommand: unknown) {
    const command = RespondReadyCheckCommandV2Schema.parse(rawCommand);
    const actorPlayerId = this.requireActor(actor);
    return await this.executeSessionCommand(
      actorPlayerId,
      command,
      'respond_ready_check_v2',
      async (session) => {
        this.assertExpectedVersion(session, command.expectedVersion);
        this.requireActiveMember(session, actorPlayerId);
        const check = session.readyCheck;
        if (
          session.state !== 'ready_check' ||
          !check ||
          check.checkId !== command.checkId ||
          check.state !== 'open'
        ) {
          throw new PlaySessionDomainError(
            'ready_check_not_open',
            'The requested ready check is not open.',
          );
        }
        if (Date.parse(check.deadlineAt) <= this.clock().getTime()) {
          throw new PlaySessionDomainError(
            'ready_check_expired',
            'The ready check deadline has passed.',
          );
        }
        if (!check.requiredPlayerIds.includes(actorPlayerId)) {
          throw new PlaySessionDomainError(
            'membership_required',
            'The actor was not part of the ready-check membership snapshot.',
          );
        }
        const existing = check.responses.find(
          (response) => response.playerId === actorPlayerId,
        );
        if (existing) {
          existing.response = command.response;
          existing.respondedAt = this.now();
        } else {
          check.responses.push({
            playerId: actorPlayerId,
            respondedAt: this.now(),
            response: command.response,
          });
        }
        check.version += 1;
        const allReady = check.requiredPlayerIds.every((playerId) =>
          check.responses.some(
            (response) =>
              response.playerId === playerId && response.response === 'ready',
          ),
        );
        if (allReady) {
          check.state = 'passed';
          session.state = 'scheduled';
          session.scheduledFor ??= this.now();
        }
        this.touch(session);

        const eventIds: string[] = [];
        eventIds.push(
          this.emit(session, actorPlayerId, command.correlationId, null, {
            eventType:
              command.response === 'ready'
                ? 'session.member_ready.v2'
                : 'session.member_not_ready.v2',
            payload: {
              checkId: check.checkId,
              memberPlayerId: actorPlayerId,
              response: command.response,
              sessionId: session.sessionId,
            },
          }).eventId,
        );
        if (allReady) {
          const passedEvent = this.emit(
            session,
            actorPlayerId,
            command.correlationId,
            eventIds.at(-1) ?? null,
            {
              eventType: 'session.ready_check_passed.v2',
              payload: {
                checkId: check.checkId,
                participantPlayerIds: check.requiredPlayerIds,
                passedAt: this.now(),
                sessionId: session.sessionId,
              },
            },
          );
          eventIds.push(passedEvent.eventId);
          eventIds.push(
            this.emit(
              session,
              actorPlayerId,
              command.correlationId,
              passedEvent.eventId,
              {
                eventType: 'session.scheduled.v2',
                payload: {
                  scheduledFor: session.scheduledFor,
                  sessionId: session.sessionId,
                  timezone: session.timezone,
                },
              },
            ).eventId,
          );
        }
        return {
          eventIds,
          resultCode: allReady ? 'ready_check_passed' : 'ready_recorded',
        };
      },
    );
  }

  async schedule(actor: PlaySessionActorContext, rawCommand: unknown) {
    const command = ScheduleSessionCommandV2Schema.parse(rawCommand);
    const actorPlayerId = this.requireActor(actor);
    return await this.executeSessionCommand(
      actorPlayerId,
      command,
      'schedule_session_v2',
      async (session) => {
        this.assertExpectedVersion(session, command.expectedVersion);
        this.assertOwner(session, actorPlayerId);
        if (!['recruiting', 'scheduled'].includes(session.state)) {
          throw new PlaySessionDomainError(
            'invalid_transition',
            'The Session cannot be scheduled from its current state.',
          );
        }
        session.scheduledFor = command.scheduledFor;
        session.timezone = command.timezone;
        this.touch(session);
        const event = this.emit(
          session,
          actorPlayerId,
          command.correlationId,
          null,
          {
            eventType: 'session.scheduled.v2',
            payload: {
              scheduledFor: command.scheduledFor,
              sessionId: session.sessionId,
              timezone: command.timezone,
            },
          },
        );
        return { eventIds: [event.eventId], resultCode: 'scheduled' as const };
      },
    );
  }

  async start(actor: PlaySessionActorContext, rawCommand: unknown) {
    const command = StartSessionCommandV2Schema.parse(rawCommand);
    const actorPlayerId = this.requireActor(actor);
    return await this.executeSessionCommand(
      actorPlayerId,
      command,
      'start_session_v2',
      async (session) => {
        this.assertExpectedVersion(session, command.expectedVersion);
        this.assertOwner(session, actorPlayerId);
        if (
          session.state !== 'scheduled' ||
          session.readyCheck?.state !== 'passed'
        ) {
          throw new PlaySessionDomainError(
            'ready_policy_not_satisfied',
            'A passed ready check is required before Session start.',
          );
        }
        const activePlayerIds = this.activeParticipantIds(session);
        if (
          !samePlayers(activePlayerIds, session.readyCheck.requiredPlayerIds)
        ) {
          throw new PlaySessionDomainError(
            'ready_policy_not_satisfied',
            'Session membership changed after ready-check pass.',
          );
        }
        await this.lifecycleProvider.assertActive(
          activePlayerIds.filter((playerId) => playerId !== actorPlayerId),
        );
        session.startedAt = this.now();
        session.state = 'in_progress';
        this.touch(session);
        const event = this.emit(
          session,
          actorPlayerId,
          command.correlationId,
          null,
          {
            eventType: 'session.started.v2',
            payload: {
              participantPlayerIds: activePlayerIds,
              sessionId: session.sessionId,
              startedAt: session.startedAt,
            },
          },
        );
        return { eventIds: [event.eventId], resultCode: 'started' as const };
      },
    );
  }

  async proposeCompletion(actor: PlaySessionActorContext, rawCommand: unknown) {
    const command = ProposeSessionCompletionCommandV2Schema.parse(rawCommand);
    const actorPlayerId = this.requireActor(actor);
    return await this.executeSessionCommand(
      actorPlayerId,
      command,
      'propose_session_completion_v2',
      async (session) => {
        this.assertExpectedVersion(session, command.expectedVersion);
        if (!['in_progress', 'completion_pending'].includes(session.state)) {
          throw new PlaySessionDomainError(
            'invalid_transition',
            'Completion can be proposed only after the Session starts.',
          );
        }
        this.requireActiveMember(session, actorPlayerId);
        if (
          session.completionClaims.some(
            (claim) => claim.playerId === actorPlayerId,
          )
        ) {
          throw new PlaySessionDomainError(
            'validation_failed',
            'The participant already submitted a completion claim.',
          );
        }
        const claim = {
          claimId: this.createUuid() as never,
          claimedAt: this.now(),
          kind: command.claim,
          playerId: actorPlayerId,
          reasonCode: command.reasonCode,
        };
        session.completionClaims.push(claim);

        const activeIds = this.activeParticipantIds(session);
        let resultCode: CommandResultCode = 'completion_pending';
        if (command.claim !== 'completed') {
          session.state = 'disputed';
          resultCode = 'disputed';
        } else {
          const completedIds = new Set(
            session.completionClaims
              .filter((current) => current.kind === 'completed')
              .map((current) => current.playerId),
          );
          if (activeIds.every((playerId) => completedIds.has(playerId))) {
            if (!session.startedAt) {
              throw new PlaySessionDomainError(
                'internal_error',
                'A completing Session has no authoritative start time.',
              );
            }
            session.state = 'completed';
            session.completedAt = this.now();
            resultCode = 'completed';
          } else {
            session.state = 'completion_pending';
          }
        }
        this.touch(session);

        const proposedEvent = this.emit(
          session,
          actorPlayerId,
          command.correlationId,
          null,
          {
            eventType: 'session.completion_proposed.v2',
            payload: {
              claim,
              participantPlayerIds: activeIds,
              sessionId: session.sessionId,
            },
          },
        );
        const eventIds = [proposedEvent.eventId];
        if (resultCode === 'disputed') {
          eventIds.push(
            this.emit(
              session,
              actorPlayerId,
              command.correlationId,
              proposedEvent.eventId,
              {
                eventType: 'session.disputed.v2',
                payload: {
                  claim,
                  disputeWindowClosesAt: new Date(
                    this.clock().getTime() + 24 * 60 * 60 * 1000,
                  ).toISOString(),
                  sessionId: session.sessionId,
                },
              },
            ).eventId,
          );
        }
        if (resultCode === 'completed') {
          if (!session.completedAt || !session.startedAt) {
            throw new PlaySessionDomainError(
              'internal_error',
              'Completed Session timestamps are missing.',
            );
          }
          eventIds.push(
            this.emit(
              session,
              actorPlayerId,
              command.correlationId,
              proposedEvent.eventId,
              {
                eventType: 'session.completed.v2',
                payload: {
                  completedAt: session.completedAt,
                  participantPlayerIds: activeIds,
                  roleAssignments: session.roleAssignments,
                  scheduledFor: session.scheduledFor,
                  sessionId: session.sessionId,
                  source: session.source,
                  startedAt: session.startedAt,
                  verification: 'participant_quorum',
                },
              },
            ).eventId,
          );
        }
        return { eventIds, resultCode };
      },
    );
  }

  async cancel(actor: PlaySessionActorContext, rawCommand: unknown) {
    const command = CancelSessionCommandV2Schema.parse(rawCommand);
    const actorPlayerId = this.requireActor(actor);
    return await this.executeSessionCommand(
      actorPlayerId,
      command,
      'cancel_session_v2',
      async (session) => {
        this.assertExpectedVersion(session, command.expectedVersion);
        this.assertOwner(session, actorPlayerId);
        if (terminalSessionStates.has(session.state)) {
          throw new PlaySessionDomainError(
            'invalid_transition',
            'A terminal Session cannot be cancelled.',
          );
        }
        session.cancellationReason = command.reason;
        session.cancelledAt = this.now();
        session.state = 'cancelled';
        this.touch(session);
        const event = this.emit(
          session,
          actorPlayerId,
          command.correlationId,
          null,
          {
            eventType: 'session.cancelled.v2',
            payload: {
              cancelledAt: session.cancelledAt,
              reasonCode: command.reason,
              sessionId: session.sessionId,
            },
          },
        );
        return { eventIds: [event.eventId], resultCode: 'cancelled' as const };
      },
    );
  }

  async getCapabilities(
    actor: PlaySessionActorContext,
    sessionId: PlaySessionId,
  ) {
    const actorPlayerId = this.requireActor(actor);
    const session = this.requireSession(sessionId);
    const active = this.isActiveMember(session, actorPlayerId);
    const owner = session.ownerPlayerId === actorPlayerId && active;
    const mutable = !terminalSessionStates.has(session.state);
    return PlaySessionCapabilitiesV2Schema.parse({
      canAssignRole: owner && mutable && session.state !== 'in_progress',
      canCancel: owner && mutable,
      canInvite:
        owner && session.state === 'recruiting' && this.hasCapacity(session),
      canLeave: active && !owner && mutable,
      canOpenReadyCheck:
        owner &&
        ['recruiting', 'scheduled'].includes(session.state) &&
        this.activeParticipantIds(session).length >= 2 &&
        session.communication.status === 'ready',
      canProposeCompletion:
        active && ['in_progress', 'completion_pending'].includes(session.state),
      canRemoveMember: owner && mutable && session.state !== 'in_progress',
      canRespondReady: active && session.state === 'ready_check',
      canSchedule: owner && ['recruiting', 'scheduled'].includes(session.state),
      canStart:
        owner &&
        session.state === 'scheduled' &&
        session.readyCheck?.state === 'passed',
      denialReasonCodes: [],
    });
  }

  async getMembership(sessionId: PlaySessionId) {
    return projectSessionMembership(this.requireSession(sessionId));
  }
}
