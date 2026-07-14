import {
  PlaySessionCommandReceiptV2Schema,
  PlaySessionIdSchema,
  RepeatPlayRequestedEventV2Schema,
  SessionInviteV2IdSchema,
  type PlaySessionCommandReceiptV2,
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
import type { RepeatPlaySessionEventConsumer } from './play-session-repository';

export class InMemoryRepeatPlaySessionService
  extends InMemoryPlaySessionService
  implements RepeatPlaySessionEventConsumer
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
