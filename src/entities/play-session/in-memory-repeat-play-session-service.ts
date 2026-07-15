import {
  PlaySessionCommandReceiptV2Schema,
  PlaySessionIdSchema,
  PlayerBlockedEventV2Schema,
  RepeatPlayRequestedEventV2Schema,
  SessionInviteV2IdSchema,
  type PlaySessionCommandReceiptV2,
  type PlaySessionId,
  type PlayerBlockedEventV2,
  type RepeatPlayRequestedEventV2,
} from '@/shared/contracts/core-v2';

import {
  projectSessionMembership,
  snapshotSession,
  uniquePlayers,
  type MutableSession,
} from './in-memory-play-session-kernel';
import { InMemoryPlaySessionService } from './in-memory-play-session-service';
import { PlaySessionDomainError } from './play-session-error';
import type {
  PlaySessionActorContext,
  PlaySessionSocialEventConsumer,
  RepeatPlaySessionEventConsumer,
  SessionSocialPolicyActionV2,
  SessionSocialPolicyReceiptV2,
} from './play-session-repository';

export class InMemoryRepeatPlaySessionService
  extends InMemoryPlaySessionService
  implements RepeatPlaySessionEventConsumer, PlaySessionSocialEventConsumer
{
  private readonly repeatEventReceipts = new Map<
    string,
    Readonly<{
      eventJson: string;
      receipt: PlaySessionCommandReceiptV2;
    }>
  >();
  private readonly repeatRequestReceipts = new Map<
    string,
    PlaySessionCommandReceiptV2
  >();
  private readonly socialEventReceipts = new Map<
    string,
    Readonly<{
      eventJson: string;
      receipt: SessionSocialPolicyReceiptV2;
    }>
  >();
  private readonly revokedSessionAccess = new Set<string>();

  override async get(actor: PlaySessionActorContext, sessionId: PlaySessionId) {
    const actorPlayerId = this.requireActor(actor);
    this.assertSessionVisible(sessionId, actorPlayerId);
    return await super.get(actor, sessionId);
  }

  override async listCurrent(actor: PlaySessionActorContext) {
    const actorPlayerId = this.requireActor(actor);
    return (await super.listCurrent(actor)).filter(
      (session) =>
        !this.isSessionAccessRevoked(session.sessionId, actorPlayerId),
    );
  }

  override async listInvites(actor: PlaySessionActorContext, limit = 20) {
    const actorPlayerId = this.requireActor(actor);
    return (await super.listInvites(actor, limit)).filter(
      (invite) => !this.isSessionAccessRevoked(invite.sessionId, actorPlayerId),
    );
  }

  async consumePlayerBlocked(
    rawEvent: PlayerBlockedEventV2,
  ): Promise<SessionSocialPolicyReceiptV2> {
    const event = PlayerBlockedEventV2Schema.parse(rawEvent);
    const eventJson = JSON.stringify(event);
    const replay = this.socialEventReceipts.get(event.eventId);
    if (replay) {
      if (replay.eventJson !== eventJson) {
        throw new PlaySessionDomainError(
          'event_replay_conflict',
          'Social eventId was replayed with different content.',
        );
      }
      return { ...replay.receipt, repeated: true };
    }

    const candidateSessionIds = new Set<PlaySessionId>();
    for (const session of this.sessions.values()) {
      const active = new Set(
        session.members
          .filter((member) => member.state === 'active')
          .map((member) => member.playerId),
      );
      if (
        active.has(event.payload.blockerPlayerId) &&
        active.has(event.payload.blockedPlayerId)
      ) {
        candidateSessionIds.add(session.sessionId);
      }
    }
    for (const invite of this.invites.values()) {
      if (
        invite.state === 'pending' &&
        sameBlockedPair(
          invite.inviterPlayerId,
          invite.targetPlayerId,
          event.payload.blockerPlayerId,
          event.payload.blockedPlayerId,
        )
      ) {
        candidateSessionIds.add(invite.sessionId);
      }
    }

    const actions: SessionSocialPolicyActionV2[] = [];
    const reconcileSessionIds: PlaySessionId[] = [];
    for (const sessionId of candidateSessionIds) {
      const action = await this.withLock(
        `session:${sessionId}`,
        async (): Promise<SessionSocialPolicyActionV2> => {
          const session = this.requireSession(sessionId);
          const matchingInvites = [...this.invites.values()].filter(
            (invite) =>
              invite.sessionId === sessionId &&
              invite.state === 'pending' &&
              sameBlockedPair(
                invite.inviterPlayerId,
                invite.targetPlayerId,
                event.payload.blockerPlayerId,
                event.payload.blockedPlayerId,
              ),
          );
          for (const invite of matchingInvites) {
            invite.state = 'cancelled';
            invite.version += 1;
          }

          const activePlayerIds = new Set(
            session.members
              .filter((member) => member.state === 'active')
              .map((member) => member.playerId),
          );
          const bothPlayersActive =
            activePlayerIds.has(event.payload.blockerPlayerId) &&
            activePlayerIds.has(event.payload.blockedPlayerId);
          let action: SessionSocialPolicyActionV2['action'] = 'no_change';
          let sessionChanged = false;

          if (
            bothPlayersActive &&
            (session.state === 'in_progress' ||
              session.state === 'completion_pending')
          ) {
            session.state = 'disputed';
            session.version += 1;
            session.updatedAt = event.occurredAt;
            sessionChanged = true;
            action = 'session_disputed';
            this.revokeSessionAccess(sessionId, event.payload.blockerPlayerId);
            this.revokeSessionAccess(sessionId, event.payload.blockedPlayerId);
            this.emit(
              session,
              event.payload.blockerPlayerId,
              event.correlationId,
              event.eventId,
              {
                eventType: 'session.safety_disputed.v2',
                payload: {
                  blockedPlayerId: event.payload.blockedPlayerId,
                  blockerPlayerId: event.payload.blockerPlayerId,
                  reasonCode:
                    event.payload.reasonCode ?? 'relationship_blocked',
                  sessionId,
                  sourceSocialEventId: event.eventId,
                },
              },
            );
          } else if (
            bothPlayersActive &&
            ['draft', 'recruiting', 'ready_check', 'scheduled'].includes(
              session.state,
            )
          ) {
            const removedPlayerId =
              event.payload.blockedPlayerId === session.ownerPlayerId
                ? event.payload.blockerPlayerId
                : event.payload.blockedPlayerId;
            const member = session.members.find(
              (candidate) =>
                candidate.playerId === removedPlayerId &&
                candidate.state === 'active',
            );
            if (member && member.role !== 'owner') {
              member.state = 'removed';
              member.leftAt = event.occurredAt;
              if (session.readyCheck?.state === 'open') {
                session.readyCheck.state = 'cancelled';
                session.readyCheck.version += 1;
              }
              session.state = 'recruiting';
              session.membershipVersion += 1;
              session.version += 1;
              session.updatedAt = event.occurredAt;
              session.communication.status = 'pending';
              sessionChanged = true;
              action = 'member_removed';
              this.revokeSessionAccess(sessionId, removedPlayerId);
              this.emit(
                session,
                event.payload.blockerPlayerId,
                event.correlationId,
                event.eventId,
                {
                  eventType: 'session.member_left.v2',
                  payload: {
                    memberPlayerId: removedPlayerId,
                    membership: projectSessionMembership(session),
                    reasonCode: 'relationship_blocked',
                    sessionId,
                  },
                },
              );
              reconcileSessionIds.push(sessionId);
            }
          }

          if (matchingInvites.length > 0) {
            if (!sessionChanged) {
              session.version += 1;
              session.updatedAt = event.occurredAt;
            }
            for (const invite of matchingInvites) {
              this.emit(
                session,
                event.payload.blockerPlayerId,
                event.correlationId,
                event.eventId,
                {
                  eventType: 'session.invite_cancelled.v2',
                  payload: {
                    inviteId: invite.id,
                    reasonCode: 'relationship_blocked',
                    sessionId,
                    sourceSocialEventId: event.eventId,
                    targetPlayerId: invite.targetPlayerId,
                  },
                },
              );
            }
            if (action === 'no_change') action = 'invite_cancelled';
          }

          return socialAction(session, action, matchingInvites.length);
        },
      );
      actions.push(action);
    }

    for (const sessionId of reconcileSessionIds) {
      await this.reconcileCommunication(sessionId, event.correlationId);
    }

    const receipt: SessionSocialPolicyReceiptV2 = {
      actions,
      repeated: false,
      sourceEventId: event.eventId,
    };
    this.socialEventReceipts.set(event.eventId, { eventJson, receipt });
    return receipt;
  }

  private isSessionAccessRevoked(sessionId: PlaySessionId, playerId: string) {
    return this.revokedSessionAccess.has(sessionAccessKey(sessionId, playerId));
  }

  private assertSessionVisible(sessionId: PlaySessionId, playerId: string) {
    if (this.isSessionAccessRevoked(sessionId, playerId)) {
      throw new PlaySessionDomainError(
        'session_visibility_revoked',
        'Session visibility was revoked by social safety policy.',
      );
    }
  }

  private revokeSessionAccess(sessionId: PlaySessionId, playerId: string) {
    this.revokedSessionAccess.add(sessionAccessKey(sessionId, playerId));
  }

  async consumeRepeatPlayRequested(rawEvent: RepeatPlayRequestedEventV2) {
    const event = RepeatPlayRequestedEventV2Schema.parse(rawEvent);
    const eventJson = JSON.stringify(event);
    const replay = this.repeatEventReceipts.get(event.eventId);
    if (replay) {
      if (replay.eventJson !== eventJson) {
        throw new PlaySessionDomainError(
          'event_replay_conflict',
          'Repeat-play eventId was replayed with different content.',
        );
      }
      return PlaySessionCommandReceiptV2Schema.parse({
        ...replay.receipt,
        repeated: true,
      });
    }

    return await this.withLock(
      `repeat-request:${event.payload.requestId}`,
      async () => {
        if (this.repeatRequestReceipts.has(event.payload.requestId)) {
          throw new PlaySessionDomainError(
            'event_replay_conflict',
            'Repeat-play request aggregate was emitted with a different eventId.',
          );
        }
        const participants = uniquePlayers([
          event.payload.requesterPlayerId,
          ...event.payload.teammatePlayerIds,
        ]);
        await this.lifecycleProvider.assertActive(participants);
        await this.assertPairwiseSessionEligibility(participants);

        const now = this.now();
        const sessionId = PlaySessionIdSchema.parse(this.createUuid());
        const session: MutableSession = {
          cancellationReason: null,
          cancelledAt: null,
          capacity: participants.length,
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
              playerId: event.payload.requesterPlayerId,
              role: 'owner',
              state: 'active',
            },
          ],
          membershipVersion: 1,
          ownerPlayerId: event.payload.requesterPlayerId,
          readyCheck: null,
          roleAssignments: [],
          scheduledFor: null,
          sessionId,
          source: {
            kind: 'repeat_play',
            requestId: event.payload.requestId,
          },
          startedAt: null,
          state: 'recruiting',
          timezone: 'UTC',
          title: 'Chơi lại cùng đồng đội',
          updatedAt: now,
          version: 1,
        };
        this.sessions.set(sessionId, session);
        this.sourceSessions.set(`repeat:${event.payload.requestId}`, sessionId);

        const createdEvent = this.emit(
          session,
          event.payload.requesterPlayerId,
          event.correlationId,
          event.eventId,
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
        for (const targetPlayerId of event.payload.teammatePlayerIds) {
          const inviteId = SessionInviteV2IdSchema.parse(this.createUuid());
          this.invites.set(inviteId, {
            createdAt: now,
            expiresAt: null,
            id: inviteId,
            inviterPlayerId: event.payload.requesterPlayerId,
            sessionId,
            state: 'pending',
            targetPlayerId,
            version: 1,
          });
          const inviteEvent = this.emit(
            session,
            event.payload.requesterPlayerId,
            event.correlationId,
            createdEvent.eventId,
            {
              eventType: 'session.invite_created.v2',
              payload: {
                actorPlayerId: event.payload.requesterPlayerId,
                inviteId,
                sessionId,
                targetPlayerId,
              },
            },
          );
          eventIds.push(inviteEvent.eventId);
        }

        const receipt = this.receipt(
          session,
          event.correlationId,
          'create_session_from_repeat_play_v2',
          'created',
          eventIds,
        );
        this.repeatRequestReceipts.set(event.payload.requestId, receipt);
        this.repeatEventReceipts.set(event.eventId, { eventJson, receipt });
        return receipt;
      },
    );
  }
}

function socialAction(
  session: MutableSession,
  action: SessionSocialPolicyActionV2['action'],
  cancelledInviteCount = 0,
): SessionSocialPolicyActionV2 {
  return {
    action,
    ...(cancelledInviteCount > 0 ? { cancelledInviteCount } : {}),
    membershipVersion: session.membershipVersion,
    sessionId: session.sessionId,
    sessionVersion: session.version,
  };
}

function sameBlockedPair(
  left: string,
  right: string,
  blockerPlayerId: string,
  blockedPlayerId: string,
) {
  return (
    (left === blockerPlayerId && right === blockedPlayerId) ||
    (left === blockedPlayerId && right === blockerPlayerId)
  );
}

function sessionAccessKey(sessionId: string, playerId: string) {
  return `${sessionId}:${playerId}`;
}
