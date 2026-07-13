import { z } from 'zod';
import {
  ConversationIdSchema,
  CorrelationIdSchema,
  EventIdSchema,
  MatchIdSchema,
  MatchIntentIdSchema,
  PlayerIdSchema,
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

export const ConversationBootstrappedEventV1Schema =
  EventEnvelopeBaseV1Schema.extend({
    eventType: z.literal('conversation.bootstrapped.v1'),
    aggregateType: z.literal('conversation'),
    aggregateId: ConversationIdSchema,
    data: z.object({
      matchId: MatchIdSchema,
      conversationId: ConversationIdSchema,
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
      reasonCode: z.enum(['match_created', 'set_invite', 'set_join_requested']),
      target: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('match'), matchId: MatchIdSchema }),
        z.object({ kind: z.literal('set'), setId: SetIdSchema }),
      ]),
    }),
  });
