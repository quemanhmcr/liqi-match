import { z } from 'zod';

import { PlayerIdSchema } from '../../core-v1';
import {
  FriendshipRequestIdV2Schema,
  ReportIdV2Schema,
  SocialRelationshipIdV2Schema,
} from '../social/semantic-ids';
import {
  FriendshipRequestStateV2Schema,
  PlayerPrivacySettingsV2Schema,
  RelationshipFriendshipLabelV2Schema,
  ReportCategoryV2Schema,
} from '../social/relationship';
import { CoreV2EventEnvelopeSchema } from './events';

const relationshipEvent = <T extends z.ZodTypeAny>(
  eventType: string,
  payload: T,
) =>
  CoreV2EventEnvelopeSchema.extend({
    aggregateId: SocialRelationshipIdV2Schema,
    aggregateType: z.literal('social_relationship'),
    eventType: z.literal(eventType),
    payload,
  }).strict();

const friendshipPayload = z
  .object({
    friendshipLabel: RelationshipFriendshipLabelV2Schema,
    friendshipRequestId: FriendshipRequestIdV2Schema,
    recipientPlayerId: PlayerIdSchema,
    requesterPlayerId: PlayerIdSchema,
    requestState: FriendshipRequestStateV2Schema,
  })
  .strict();

export const FriendshipRequestedEventV2Schema = relationshipEvent(
  'friendship.requested.v2',
  friendshipPayload.extend({
    expiresAt: z.string().datetime({ offset: true }),
  }),
);
export const FriendshipAcceptedEventV2Schema = relationshipEvent(
  'friendship.accepted.v2',
  friendshipPayload,
);
export const FriendshipDeclinedEventV2Schema = relationshipEvent(
  'friendship.declined.v2',
  friendshipPayload,
);
export const FriendshipCancelledEventV2Schema = relationshipEvent(
  'friendship.cancelled.v2',
  friendshipPayload,
);
export const FriendshipRemovedEventV2Schema = relationshipEvent(
  'friendship.removed.v2',
  z
    .object({
      playerHighId: PlayerIdSchema,
      playerLowId: PlayerIdSchema,
      removedByPlayerId: PlayerIdSchema,
    })
    .strict(),
);
export const PlayerBlockedEventV2Schema = relationshipEvent(
  'player.blocked.v2',
  z
    .object({
      blockedPlayerId: PlayerIdSchema,
      blockerPlayerId: PlayerIdSchema,
      reasonCode: z.string().min(1).max(64).nullable(),
    })
    .strict(),
);
export type PlayerBlockedEventV2 = z.infer<typeof PlayerBlockedEventV2Schema>;

export const PlayerUnblockedEventV2Schema = relationshipEvent(
  'player.unblocked.v2',
  z
    .object({
      blockedPlayerId: PlayerIdSchema,
      blockerPlayerId: PlayerIdSchema,
      friendshipRestored: z.literal(false),
    })
    .strict(),
);
export const PlayerMutedEventV2Schema = relationshipEvent(
  'player.muted.v2',
  z
    .object({ mutedPlayerId: PlayerIdSchema, muterPlayerId: PlayerIdSchema })
    .strict(),
);
export const PlayerUnmutedEventV2Schema = relationshipEvent(
  'player.unmuted.v2',
  z
    .object({ mutedPlayerId: PlayerIdSchema, muterPlayerId: PlayerIdSchema })
    .strict(),
);

export const PrivacyUpdatedEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  aggregateId: PlayerIdSchema,
  aggregateType: z.literal('player_privacy'),
  eventType: z.literal('privacy.updated.v2'),
  payload: PlayerPrivacySettingsV2Schema,
}).strict();

export const ReportSubmittedEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  aggregateId: ReportIdV2Schema,
  aggregateType: z.literal('report'),
  eventType: z.literal('report.submitted.v2'),
  payload: z
    .object({
      category: ReportCategoryV2Schema,
      conversationId: z.string().uuid().nullable(),
      messageId: z.string().uuid().nullable(),
      reportId: ReportIdV2Schema,
      reporterPlayerId: PlayerIdSchema,
      targetPlayerId: PlayerIdSchema,
    })
    .strict(),
}).strict();

export const CoreV2SocialEventSchema = z.discriminatedUnion('eventType', [
  FriendshipRequestedEventV2Schema,
  FriendshipAcceptedEventV2Schema,
  FriendshipDeclinedEventV2Schema,
  FriendshipCancelledEventV2Schema,
  FriendshipRemovedEventV2Schema,
  PlayerBlockedEventV2Schema,
  PlayerUnblockedEventV2Schema,
  PlayerMutedEventV2Schema,
  PlayerUnmutedEventV2Schema,
  PrivacyUpdatedEventV2Schema,
  ReportSubmittedEventV2Schema,
]);

export type CoreV2SocialEvent = z.infer<typeof CoreV2SocialEventSchema>;
