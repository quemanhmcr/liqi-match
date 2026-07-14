import { z } from 'zod';

import {
  ActivityItemV2Schema,
  EngagementPreferencesV2Schema,
} from '../activity/activity';
import {
  PlayerIdSchema,
  RepeatPlayRequestIdSchema,
} from '../identity/semantic-ids';
import {
  ActivityNotificationRequestEmittedEventV2Schema,
  ActivityNotificationRequestedEventV2Schema,
} from '../notification/activity-notification';
import {
  ParticipationConfirmationV2Schema,
  SessionOutcomeSnapshotV2Schema,
} from '../outcomes/session-outcomes';
import {
  PlayerEndorsementV2Schema,
  PlayerTrustProjectionV2Schema,
} from '../trust/reputation';
import { coreV2EventSchema } from './event-envelope';

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
      requestId: RepeatPlayRequestIdSchema,
      requesterPlayerId: PlayerIdSchema,
      teammatePlayerIds: z.array(PlayerIdSchema).min(1).max(4),
    })
    .strict()
    .superRefine((payload, context) => {
      if (
        new Set(payload.teammatePlayerIds).size !==
        payload.teammatePlayerIds.length
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Repeat-play teammate PlayerIds must be unique.',
          path: ['teammatePlayerIds'],
        });
      }
      if (payload.teammatePlayerIds.includes(payload.requesterPlayerId)) {
        context.addIssue({
          code: 'custom',
          message: 'Repeat-play requester cannot be a teammate.',
          path: ['teammatePlayerIds'],
        });
      }
    }),
});
export type RepeatPlayRequestedEventV2 = z.infer<
  typeof RepeatPlayRequestedEventV2Schema
>;

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

export const ActivityItemDismissedEventV2Schema = coreV2EventSchema({
  aggregateType: 'activity_item',
  eventType: 'activity.item_dismissed.v2',
  payload: z.object({ activityItem: ActivityItemV2Schema }).strict(),
});

export const EngagementPreferencesUpdatedEventV2Schema = coreV2EventSchema({
  aggregateType: 'engagement_preferences',
  eventType: 'engagement.preferences_updated.v2',
  payload: z.object({ preferences: EngagementPreferencesV2Schema }).strict(),
});

export const CoreV2TrustOutcomeEventSchema = z.discriminatedUnion('eventType', [
  SessionOutcomeRecordedEventV2Schema,
  SessionParticipationConfirmedEventV2Schema,
  SessionParticipationDisputedEventV2Schema,
  PlayerEndorsedEventV2Schema,
  PlayerReputationChangedEventV2Schema,
  RepeatPlayRequestedEventV2Schema,
  RepeatTeammateFormedEventV2Schema,
  ActivityItemCreatedEventV2Schema,
  ActivityItemDismissedEventV2Schema,
  EngagementPreferencesUpdatedEventV2Schema,
  ActivityNotificationRequestEmittedEventV2Schema,
  ActivityNotificationRequestedEventV2Schema,
]);
export type CoreV2TrustOutcomeEvent = z.infer<
  typeof CoreV2TrustOutcomeEventSchema
>;
