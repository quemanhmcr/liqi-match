import { z } from 'zod';
import {
  ConversationIdSchema,
  CorrelationIdSchema,
  EventIdSchema,
  MatchIdSchema,
  MatchIntentIdSchema,
  AccountIdSchema,
  PlayerIdSchema,
  ProfileIdSchema,
  SetIdSchema,
} from '../identity/semantic-ids';
import { MatchCreatedV1Schema } from '../match/match-created';
import { MatchIntentSnapshotV1Schema } from '../discovery/match-intent';

const EventEnvelopeBaseV1Schema = z.object({
  eventId: EventIdSchema,
  occurredAt: z.string().datetime({ offset: true }),
  correlationId: CorrelationIdSchema,
  causationId: EventIdSchema.nullable(),
});

export const MatchIntentActivatedEventV1Schema =
  EventEnvelopeBaseV1Schema.extend({
    eventType: z.literal('match_intent.activated.v1'),
    aggregateType: z.literal('match_intent'),
    aggregateId: MatchIntentIdSchema,
    data: MatchIntentSnapshotV1Schema,
  });

export const PlayerLikedEventV1Schema = EventEnvelopeBaseV1Schema.extend({
  eventType: z.literal('player.liked.v1'),
  aggregateType: z.literal('relationship'),
  aggregateId: z.string().uuid(),
  data: z.object({
    actorPlayerId: PlayerIdSchema,
    targetPlayerId: PlayerIdSchema,
  }),
});

export const MatchCreatedEventV1Schema = EventEnvelopeBaseV1Schema.extend({
  eventType: z.literal('match.created.v1'),
  aggregateType: z.literal('match'),
  aggregateId: MatchIdSchema,
  data: MatchCreatedV1Schema,
});

export const ConversationBootstrapRequestedEventV1Schema =
  EventEnvelopeBaseV1Schema.extend({
    eventType: z.literal('conversation.bootstrap_requested.v1'),
    aggregateType: z.literal('match'),
    aggregateId: MatchIdSchema,
    data: z.object({
      matchId: MatchIdSchema,
      participantIds: z.tuple([PlayerIdSchema, PlayerIdSchema]),
      requestedAt: z.string().datetime({ offset: true }),
    }),
  });

export const SetJoinRequestedEventV1Schema = EventEnvelopeBaseV1Schema.extend({
  eventType: z.literal('set.join_requested.v1'),
  aggregateType: z.literal('set'),
  aggregateId: SetIdSchema,
  data: z.object({ setId: SetIdSchema, actorPlayerId: PlayerIdSchema }),
});

export const SetInviteCreatedEventV1Schema = EventEnvelopeBaseV1Schema.extend({
  eventType: z.literal('set.invite_created.v1'),
  aggregateType: z.literal('set'),
  aggregateId: SetIdSchema,
  data: z.object({
    setId: SetIdSchema,
    actorPlayerId: PlayerIdSchema,
    targetPlayerId: PlayerIdSchema,
  }),
});

export const NotificationRequestedEventV1Schema =
  EventEnvelopeBaseV1Schema.extend({
    eventType: z.literal('notification.requested.v1'),
    aggregateType: z.literal('player'),
    aggregateId: PlayerIdSchema,
    data: z.object({
      recipientPlayerId: PlayerIdSchema,
      reasonCode: z.enum([
        'match_created',
        'message_received',
        'set_invite',
        'set_join_requested',
      ]),
      target: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('match'), matchId: MatchIdSchema }),
        z.object({ kind: z.literal('set'), setId: SetIdSchema }),
        z.object({
          kind: z.literal('conversation'),
          conversationId: ConversationIdSchema,
          messageId: z.string().uuid(),
          senderPlayerId: PlayerIdSchema,
          authoritativeUnreadCount: z.number().int().positive(),
          foregroundPolicy: z.enum(['suppress_push', 'allow_push']),
        }),
      ]),
    }),
  });

const PlayerLifecycleEventDataV1Schema = z.object({
  accountId: AccountIdSchema,
  playerId: PlayerIdSchema,
  profileId: ProfileIdSchema,
  lifecycleVersion: z.number().int().positive(),
  profileVersion: z.number().int().nonnegative(),
});

export const PlayerActivatedEventV1Schema = EventEnvelopeBaseV1Schema.extend({
  eventType: z.literal('player.activated.v1'),
  aggregateType: z.literal('player'),
  aggregateId: PlayerIdSchema,
  data: PlayerLifecycleEventDataV1Schema,
});

export const PlayerProfileUpdatedEventV1Schema =
  EventEnvelopeBaseV1Schema.extend({
    eventType: z.literal('player.profile_updated.v1'),
    aggregateType: z.literal('player'),
    aggregateId: PlayerIdSchema,
    data: PlayerLifecycleEventDataV1Schema,
  });

export const PlayerSuspendedEventV1Schema = EventEnvelopeBaseV1Schema.extend({
  eventType: z.literal('player.suspended.v1'),
  aggregateType: z.literal('player'),
  aggregateId: PlayerIdSchema,
  data: PlayerLifecycleEventDataV1Schema.extend({
    reasonCode: z.string().min(1).max(120),
  }),
});

export const PlayerDeletionRequestedEventV1Schema =
  EventEnvelopeBaseV1Schema.extend({
    eventType: z.literal('player.deletion_requested.v1'),
    aggregateType: z.literal('player'),
    aggregateId: PlayerIdSchema,
    data: PlayerLifecycleEventDataV1Schema,
  });

export const PlayerDeletedEventV1Schema = EventEnvelopeBaseV1Schema.extend({
  eventType: z.literal('player.deleted.v1'),
  aggregateType: z.literal('player'),
  aggregateId: PlayerIdSchema,
  data: PlayerLifecycleEventDataV1Schema,
});
