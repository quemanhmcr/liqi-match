import { z } from 'zod';

import { PlayerIdSchema } from '../../core-v1';
import {
  PlaySessionIdSchema,
  SessionInviteV2IdSchema,
} from '../identity/semantic-ids';
import {
  PlaySessionCompletionClaimV2Schema,
  PlaySessionMembershipProjectionV2Schema,
  PlaySessionReadyCheckSnapshotV2Schema,
  PlaySessionRoleAssignmentV2Schema,
  PlaySessionSnapshotV2Schema,
  PlaySessionSourceV2Schema,
} from '../party/play-session';
import { CoreV2EventEnvelopeSchema } from './event-envelope';

const sessionEventBase = {
  aggregateType: z.literal('play_session'),
  eventVersion: z.literal(2),
};

export const SessionCreatedEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...sessionEventBase,
  aggregateId: PlaySessionIdSchema,
  eventType: z.literal('session.created.v2'),
  payload: z
    .object({
      communicationProvisioningRequired: z.boolean(),
      membership: PlaySessionMembershipProjectionV2Schema,
      session: PlaySessionSnapshotV2Schema,
    })
    .strict(),
}).strict();

export const SessionInviteCreatedEventV2Schema =
  CoreV2EventEnvelopeSchema.extend({
    ...sessionEventBase,
    aggregateId: PlaySessionIdSchema,
    eventType: z.literal('session.invite_created.v2'),
    payload: z
      .object({
        actorPlayerId: PlayerIdSchema,
        inviteId: SessionInviteV2IdSchema,
        sessionId: PlaySessionIdSchema,
        targetPlayerId: PlayerIdSchema,
      })
      .strict(),
  }).strict();

export const SessionMemberJoinedEventV2Schema =
  CoreV2EventEnvelopeSchema.extend({
    ...sessionEventBase,
    aggregateId: PlaySessionIdSchema,
    eventType: z.literal('session.member_joined.v2'),
    payload: z
      .object({
        communicationProvisioningRequired: z.boolean(),
        memberPlayerId: PlayerIdSchema,
        membership: PlaySessionMembershipProjectionV2Schema,
        sessionId: PlaySessionIdSchema,
      })
      .strict(),
  }).strict();

export const SessionMemberLeftEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...sessionEventBase,
  aggregateId: PlaySessionIdSchema,
  eventType: z.literal('session.member_left.v2'),
  payload: z
    .object({
      memberPlayerId: PlayerIdSchema,
      membership: PlaySessionMembershipProjectionV2Schema,
      reasonCode: z.string().min(1).max(64),
      sessionId: PlaySessionIdSchema,
    })
    .strict(),
}).strict();

export const SessionRoleAssignedEventV2Schema =
  CoreV2EventEnvelopeSchema.extend({
    ...sessionEventBase,
    aggregateId: PlaySessionIdSchema,
    eventType: z.literal('session.role_assigned.v2'),
    payload: z
      .object({
        assignment: PlaySessionRoleAssignmentV2Schema,
        sessionId: PlaySessionIdSchema,
      })
      .strict(),
  }).strict();

export const SessionReadyCheckOpenedEventV2Schema =
  CoreV2EventEnvelopeSchema.extend({
    ...sessionEventBase,
    aggregateId: PlaySessionIdSchema,
    eventType: z.literal('session.ready_check_opened.v2'),
    payload: z
      .object({
        readyCheck: PlaySessionReadyCheckSnapshotV2Schema,
        sessionId: PlaySessionIdSchema,
      })
      .strict(),
  }).strict();

export const SessionReadyCheckExpiredEventV2Schema =
  CoreV2EventEnvelopeSchema.extend({
    ...sessionEventBase,
    aggregateId: PlaySessionIdSchema,
    eventType: z.literal('session.ready_check_expired.v2'),
    payload: z
      .object({
        checkId: z.string().uuid(),
        expiredAt: z.string().datetime({ offset: true }),
        sessionId: PlaySessionIdSchema,
      })
      .strict(),
  }).strict();

export const SessionMemberNotReadyEventV2Schema =
  CoreV2EventEnvelopeSchema.extend({
    ...sessionEventBase,
    aggregateId: PlaySessionIdSchema,
    eventType: z.literal('session.member_not_ready.v2'),
    payload: z
      .object({
        checkId: z.string().uuid(),
        memberPlayerId: PlayerIdSchema,
        response: z.literal('not_ready'),
        sessionId: PlaySessionIdSchema,
      })
      .strict(),
  }).strict();

export const SessionMemberReadyEventV2Schema = CoreV2EventEnvelopeSchema.extend(
  {
    ...sessionEventBase,
    aggregateId: PlaySessionIdSchema,
    eventType: z.literal('session.member_ready.v2'),
    payload: z
      .object({
        checkId: z.string().uuid(),
        memberPlayerId: PlayerIdSchema,
        response: z.literal('ready'),
        sessionId: PlaySessionIdSchema,
      })
      .strict(),
  },
).strict();

export const SessionReadyCheckPassedEventV2Schema =
  CoreV2EventEnvelopeSchema.extend({
    ...sessionEventBase,
    aggregateId: PlaySessionIdSchema,
    eventType: z.literal('session.ready_check_passed.v2'),
    payload: z
      .object({
        checkId: z.string().uuid(),
        passedAt: z.string().datetime({ offset: true }),
        participantPlayerIds: z.array(PlayerIdSchema).min(2).max(5),
        sessionId: PlaySessionIdSchema,
      })
      .strict(),
  }).strict();

export const SessionScheduledEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...sessionEventBase,
  aggregateId: PlaySessionIdSchema,
  eventType: z.literal('session.scheduled.v2'),
  payload: z
    .object({
      scheduledFor: z.string().datetime({ offset: true }),
      sessionId: PlaySessionIdSchema,
      timezone: z.string().min(1).max(64),
    })
    .strict(),
}).strict();

export const SessionStartedEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...sessionEventBase,
  aggregateId: PlaySessionIdSchema,
  eventType: z.literal('session.started.v2'),
  payload: z
    .object({
      participantPlayerIds: z.array(PlayerIdSchema).min(2).max(5),
      sessionId: PlaySessionIdSchema,
      startedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
}).strict();

export const SessionCompletionProposedEventV2Schema =
  CoreV2EventEnvelopeSchema.extend({
    ...sessionEventBase,
    aggregateId: PlaySessionIdSchema,
    eventType: z.literal('session.completion_proposed.v2'),
    payload: z
      .object({
        claim: PlaySessionCompletionClaimV2Schema,
        participantPlayerIds: z.array(PlayerIdSchema).min(2).max(5),
        sessionId: PlaySessionIdSchema,
      })
      .strict(),
  }).strict();

export const SessionCompletedEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...sessionEventBase,
  aggregateId: PlaySessionIdSchema,
  eventType: z.literal('session.completed.v2'),
  payload: z
    .object({
      completedAt: z.string().datetime({ offset: true }),
      participantPlayerIds: z.array(PlayerIdSchema).min(2).max(5),
      roleAssignments: z.array(PlaySessionRoleAssignmentV2Schema).max(5),
      scheduledFor: z.string().datetime({ offset: true }).nullable(),
      sessionId: PlaySessionIdSchema,
      source: PlaySessionSourceV2Schema,
      startedAt: z.string().datetime({ offset: true }),
      verification: z.literal('participant_quorum'),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        new Set(value.participantPlayerIds).size !==
        value.participantPlayerIds.length
      ) {
        context.addIssue({
          code: 'custom',
          message: 'participantPlayerIds must be unique.',
          path: ['participantPlayerIds'],
        });
      }
      if (Date.parse(value.completedAt) <= Date.parse(value.startedAt)) {
        context.addIssue({
          code: 'custom',
          message: 'completedAt must be after startedAt.',
          path: ['completedAt'],
        });
      }
    }),
}).strict();

export const SessionCancelledEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...sessionEventBase,
  aggregateId: PlaySessionIdSchema,
  eventType: z.literal('session.cancelled.v2'),
  payload: z
    .object({
      cancelledAt: z.string().datetime({ offset: true }),
      reasonCode: z.string().min(1).max(64),
      sessionId: PlaySessionIdSchema,
    })
    .strict(),
}).strict();

export const SessionDisputedEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...sessionEventBase,
  aggregateId: PlaySessionIdSchema,
  eventType: z.literal('session.disputed.v2'),
  payload: z
    .object({
      claim: PlaySessionCompletionClaimV2Schema,
      disputeWindowClosesAt: z.string().datetime({ offset: true }),
      sessionId: PlaySessionIdSchema,
    })
    .strict(),
}).strict();
