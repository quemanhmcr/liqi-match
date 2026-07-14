import { z } from 'zod';

import {
  ConversationSnapshotV1Schema,
  MessageV1Schema,
  ReadStateV1Schema,
} from '../conversation/conversation';
import {
  ConversationIdSchema,
  CorrelationIdSchema,
  EventIdSchema,
  MatchIdSchema,
  MatchIntentIdSchema,
  MatchSetIdSchema,
  AccountIdSchema,
  PlayerIdSchema,
  ProfileIdSchema,
  SetIdSchema,
  SetInviteIdSchema,
  SetJoinRequestIdSchema,
} from '../identity/semantic-ids';
import { MatchCreatedV1Schema } from '../match/match-created';
import { MatchIntentSnapshotV1Schema } from '../discovery/match-intent';
import { PlayerSuspensionReasonCodeV1Schema } from '../lifecycle/player-suspension';

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

/** @deprecated Use ConversationCreatedEventV1Schema for canonical Conversation v1 consumers. */
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
  aggregateType: z.literal('set_join_request'),
  aggregateId: SetJoinRequestIdSchema,
  data: z.object({
    joinRequestId: SetJoinRequestIdSchema,
    requesterPlayerId: PlayerIdSchema,
    setId: MatchSetIdSchema,
  }),
});

export const SetInviteCreatedEventV1Schema = EventEnvelopeBaseV1Schema.extend({
  eventType: z.literal('set.invite_created.v1'),
  aggregateType: z.literal('set_invite'),
  aggregateId: SetInviteIdSchema,
  data: z.object({
    actorPlayerId: PlayerIdSchema,
    inviteId: SetInviteIdSchema,
    setId: MatchSetIdSchema,
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
        'set_invite_created',
        'set_join_requested',
      ]),
      target: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('match'), matchId: MatchIdSchema }),
        z.object({ kind: z.literal('set'), setId: SetIdSchema }),
        z.object({
          kind: z.literal('set_invite'),
          inviteId: SetInviteIdSchema,
          setId: MatchSetIdSchema,
        }),
        z.object({
          kind: z.literal('set_join_request'),
          joinRequestId: SetJoinRequestIdSchema,
          setId: MatchSetIdSchema,
        }),
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

export const ConversationCreatedEventV1Schema =
  EventEnvelopeBaseV1Schema.extend({
    eventType: z.literal('conversation.created.v1'),
    aggregateType: z.literal('conversation'),
    aggregateId: ConversationIdSchema,
    data: z.object({
      conversation: ConversationSnapshotV1Schema,
      bootstrapEventId: EventIdSchema,
    }),
  });

export const MessageSentEventV1Schema = EventEnvelopeBaseV1Schema.extend({
  eventType: z.literal('message.sent.v1'),
  aggregateType: z.literal('conversation'),
  aggregateId: ConversationIdSchema,
  data: z.object({
    message: MessageV1Schema,
    recipientPlayerIds: z.array(PlayerIdSchema).min(1).max(1),
  }),
});

export const ConversationReadAdvancedEventV1Schema =
  EventEnvelopeBaseV1Schema.extend({
    eventType: z.literal('conversation.read_advanced.v1'),
    aggregateType: z.literal('conversation'),
    aggregateId: ConversationIdSchema,
    data: z.object({ readState: ReadStateV1Schema }),
  });

export const ConversationClosedEventV1Schema = EventEnvelopeBaseV1Schema.extend(
  {
    eventType: z.literal('conversation.closed.v1'),
    aggregateType: z.literal('conversation'),
    aggregateId: ConversationIdSchema,
    data: z.object({
      conversationId: ConversationIdSchema,
      matchId: MatchIdSchema,
      reason: z.enum(['unmatched', 'blocked', 'retention', 'administrative']),
      closedAt: z.string().datetime({ offset: true }),
      version: z.number().int().positive(),
    }),
  },
);

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
    reasonCode: PlayerSuspensionReasonCodeV1Schema,
  }),
});

export const PlayerResumedEventV1Schema = EventEnvelopeBaseV1Schema.extend({
  eventType: z.literal('player.resumed.v1'),
  aggregateType: z.literal('player'),
  aggregateId: PlayerIdSchema,
  data: PlayerLifecycleEventDataV1Schema.extend({
    reasonCode: PlayerSuspensionReasonCodeV1Schema,
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
