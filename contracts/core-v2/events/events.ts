import { z } from 'zod';

import { ActivityItemV2Schema } from '../activity/activity';
import { ActivityNotificationRequestedEventV2Schema } from '../notification/activity-notification';
import {
  PlayerIdSchema,
  PlaySessionIdSchema,
  SessionOutcomeIdSchema,
} from '../identity/semantic-ids';
import {
  ParticipationConfirmationV2Schema,
  SessionOutcomeSnapshotV2Schema,
} from '../outcomes/session-outcomes';
import {
  FriendshipRequestStateV2Schema,
  PlayerPrivacySettingsV2Schema,
  RelationshipFriendshipLabelV2Schema,
  ReportCategoryV2Schema,
} from '../social/relationship';
import {
  FriendshipRequestIdV2Schema,
  ReportIdV2Schema,
  SocialRelationshipIdV2Schema,
} from '../social/semantic-ids';
import {
  PlayerEndorsementV2Schema,
  PlayerTrustProjectionV2Schema,
} from '../trust/reputation';
import { CoreV2EventEnvelopeSchema, coreV2EventSchema } from './event-envelope';

const relationshipEvent = <T extends z.ZodTypeAny>(
  eventType: string,
  payload: T,
) =>
  CoreV2EventEnvelopeSchema.extend({
    aggregateId: SocialRelationshipIdV2Schema,
    aggregateType: z.literal('social_relationship'),
    eventType: z.literal(eventType),
    payload,
  });

const friendshipPayload = z
  .object({
    friendshipLabel: RelationshipFriendshipLabelV2Schema,
    friendshipRequestId: FriendshipRequestIdV2Schema,
    recipientPlayerId: PlayerIdSchema,
    requestState: FriendshipRequestStateV2Schema,
    requesterPlayerId: PlayerIdSchema,
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
});

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
});

export const SessionCompletedEventV2Schema = coreV2EventSchema({
  aggregateType: 'play_session',
  eventType: 'session.completed.v2',
  payload: z
    .object({
      completedAt: z.string().datetime({ offset: true }),
      memberPlayerIds: z.array(PlayerIdSchema).min(2).max(10),
      scheduledAt: z.string().datetime({ offset: true }).nullable(),
      sessionId: PlaySessionIdSchema,
      sessionVersion: z.number().int().positive(),
      startedAt: z.string().datetime({ offset: true }),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        new Set(value.memberPlayerIds).size !== value.memberPlayerIds.length
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'memberPlayerIds must be unique.',
        });
      }
      if (Date.parse(value.completedAt) <= Date.parse(value.startedAt)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'completedAt must be after startedAt.',
        });
      }
    }),
});

export const SessionOutcomeRecordedEventV2Schema = coreV2EventSchema({
  aggregateType: 'session_outcome',
  eventType: 'session.outcome_recorded.v2',
  payload: z.object({ outcome: SessionOutcomeSnapshotV2Schema }).strict(),
});

export const SessionParticipationConfirmedEventV2Schema = coreV2EventSchema({
  aggregateType: 'session_outcome',
  eventType: 'session.participation_confirmed.v2',
  payload: z
    .object({ confirmation: ParticipationConfirmationV2Schema })
    .strict(),
});

export const SessionParticipationDisputedEventV2Schema = coreV2EventSchema({
  aggregateType: 'session_outcome',
  eventType: 'session.participation_disputed.v2',
  payload: z
    .object({ confirmation: ParticipationConfirmationV2Schema })
    .strict(),
});

export const PlayerEndorsedEventV2Schema = coreV2EventSchema({
  aggregateType: 'player_endorsement',
  eventType: 'player.endorsed.v2',
  payload: z.object({ endorsement: PlayerEndorsementV2Schema }).strict(),
});

export const PlayerReputationChangedEventV2Schema = coreV2EventSchema({
  aggregateType: 'player',
  eventType: 'player.reputation_changed.v2',
  payload: z.object({ projection: PlayerTrustProjectionV2Schema }).strict(),
});

export const RepeatPlayRequestedEventV2Schema = coreV2EventSchema({
  aggregateType: 'repeat_play_request',
  eventType: 'repeat_play.requested.v2',
  payload: z
    .object({
      requestId: z.string().uuid(),
      requesterPlayerId: PlayerIdSchema,
      teammatePlayerIds: z.array(PlayerIdSchema).min(1).max(9),
    })
    .strict(),
});

export const RepeatTeammateFormedEventV2Schema = coreV2EventSchema({
  aggregateType: 'repeat_teammate',
  eventType: 'repeat_teammate.formed.v2',
  payload: z
    .object({
      completedSessionCount: z.number().int().min(2),
      playerHighId: PlayerIdSchema,
      playerLowId: PlayerIdSchema,
      relationshipId: z.string().uuid(),
    })
    .strict(),
});

export const ActivityItemCreatedEventV2Schema = coreV2EventSchema({
  aggregateType: 'activity_item',
  eventType: 'activity.item_created.v2',
  payload: z.object({ activityItem: ActivityItemV2Schema }).strict(),
});

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

export const CoreV2TrustOutcomeEventSchema = z.discriminatedUnion('eventType', [
  SessionCompletedEventV2Schema,
  SessionOutcomeRecordedEventV2Schema,
  SessionParticipationConfirmedEventV2Schema,
  SessionParticipationDisputedEventV2Schema,
  PlayerEndorsedEventV2Schema,
  PlayerReputationChangedEventV2Schema,
  RepeatPlayRequestedEventV2Schema,
  RepeatTeammateFormedEventV2Schema,
  ActivityItemCreatedEventV2Schema,
  ActivityNotificationRequestedEventV2Schema,
]);

export const CoreV2EventSchema = z.discriminatedUnion('eventType', [
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
  SessionCompletedEventV2Schema,
  SessionOutcomeRecordedEventV2Schema,
  SessionParticipationConfirmedEventV2Schema,
  SessionParticipationDisputedEventV2Schema,
  PlayerEndorsedEventV2Schema,
  PlayerReputationChangedEventV2Schema,
  RepeatPlayRequestedEventV2Schema,
  RepeatTeammateFormedEventV2Schema,
  ActivityItemCreatedEventV2Schema,
  ActivityNotificationRequestedEventV2Schema,
]);

export type CoreV2Event = z.infer<typeof CoreV2EventSchema>;
export type CoreV2SocialEvent = z.infer<typeof CoreV2SocialEventSchema>;
export type CoreV2TrustOutcomeEvent = z.infer<
  typeof CoreV2TrustOutcomeEventSchema
>;
