import { z } from 'zod';

import {
  CorrelationIdSchema,
  EventIdSchema,
  PlayerIdSchema,
  SessionIdSchema,
  SetIdSchema,
} from '../../core-v1';
import { MatchSetSnapshotV2Schema } from '../party/match-set';
import {
  PlaySessionCompletionClaimV2Schema,
  PlaySessionReadyCheckSnapshotV2Schema,
  PlaySessionRoleAssignmentV2Schema,
  PlaySessionSnapshotV2Schema,
  PlaySessionSourceV2Schema,
} from '../party/play-session';

export const CoreV2EventEnvelopeSchema = z
  .object({
    actorPlayerId: PlayerIdSchema.nullable(),
    aggregateId: z.string().uuid(),
    aggregateType: z.string().regex(/^[a-z][a-z0-9_]*$/),
    aggregateVersion: z.number().int().positive(),
    causationId: EventIdSchema.nullable(),
    correlationId: CorrelationIdSchema,
    eventId: EventIdSchema,
    eventType: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+\.v2$/),
    eventVersion: z.literal(2),
    occurredAt: z.string().datetime({ offset: true }),
    payload: z.unknown(),
  })
  .strict();

const setEventBase = {
  aggregateType: z.literal('match_set'),
  eventVersion: z.literal(2),
};
const sessionEventBase = {
  aggregateType: z.literal('play_session'),
  eventVersion: z.literal(2),
};

export const SetCreatedEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...setEventBase,
  aggregateId: SetIdSchema,
  eventType: z.literal('set.created.v2'),
  payload: z.object({ set: MatchSetSnapshotV2Schema }).strict(),
}).strict();

export const SetMemberJoinedEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...setEventBase,
  aggregateId: SetIdSchema,
  eventType: z.literal('set.member_joined.v2'),
  payload: z
    .object({
      capacity: z.number().int().min(2).max(5),
      memberCount: z.number().int().min(1).max(5),
      memberPlayerId: PlayerIdSchema,
      setId: SetIdSchema,
    })
    .strict(),
}).strict();

export const SetMemberRemovedEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...setEventBase,
  aggregateId: SetIdSchema,
  eventType: z.literal('set.member_removed.v2'),
  payload: z
    .object({
      memberPlayerId: PlayerIdSchema,
      reasonCode: z.string().min(1).max(64),
      setId: SetIdSchema,
    })
    .strict(),
}).strict();

export const SetClosedEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...setEventBase,
  aggregateId: SetIdSchema,
  eventType: z.literal('set.closed.v2'),
  payload: z
    .object({
      closedAt: z.string().datetime({ offset: true }),
      reason: z.string().min(1).max(64),
      setId: SetIdSchema,
    })
    .strict(),
}).strict();

export const SessionCreatedEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...sessionEventBase,
  aggregateId: SessionIdSchema,
  eventType: z.literal('session.created.v2'),
  payload: z
    .object({
      communicationProvisioningRequired: z.literal(true),
      participantPlayerIds: z.array(PlayerIdSchema).min(1).max(5),
      session: PlaySessionSnapshotV2Schema,
    })
    .strict(),
}).strict();

export const SessionMemberJoinedEventV2Schema =
  CoreV2EventEnvelopeSchema.extend({
    ...sessionEventBase,
    aggregateId: SessionIdSchema,
    eventType: z.literal('session.member_joined.v2'),
    payload: z
      .object({
        memberPlayerId: PlayerIdSchema,
        membershipVersion: z.number().int().positive(),
        participantPlayerIds: z.array(PlayerIdSchema).min(1).max(5),
        sessionId: SessionIdSchema,
      })
      .strict(),
  }).strict();

export const SessionMemberLeftEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...sessionEventBase,
  aggregateId: SessionIdSchema,
  eventType: z.literal('session.member_left.v2'),
  payload: z
    .object({
      memberPlayerId: PlayerIdSchema,
      membershipVersion: z.number().int().positive(),
      participantPlayerIds: z.array(PlayerIdSchema).min(1).max(5),
      reasonCode: z.string().min(1).max(64),
      sessionId: SessionIdSchema,
    })
    .strict(),
}).strict();

export const SessionRoleAssignedEventV2Schema =
  CoreV2EventEnvelopeSchema.extend({
    ...sessionEventBase,
    aggregateId: SessionIdSchema,
    eventType: z.literal('session.role_assigned.v2'),
    payload: z
      .object({
        assignment: PlaySessionRoleAssignmentV2Schema,
        sessionId: SessionIdSchema,
      })
      .strict(),
  }).strict();

export const SessionReadyCheckOpenedEventV2Schema =
  CoreV2EventEnvelopeSchema.extend({
    ...sessionEventBase,
    aggregateId: SessionIdSchema,
    eventType: z.literal('session.ready_check_opened.v2'),
    payload: z
      .object({
        readyCheck: PlaySessionReadyCheckSnapshotV2Schema,
        sessionId: SessionIdSchema,
      })
      .strict(),
  }).strict();

export const SessionMemberReadyEventV2Schema = CoreV2EventEnvelopeSchema.extend(
  {
    ...sessionEventBase,
    aggregateId: SessionIdSchema,
    eventType: z.literal('session.member_ready.v2'),
    payload: z
      .object({
        checkId: z.string().uuid(),
        memberPlayerId: PlayerIdSchema,
        response: z.literal('ready'),
        sessionId: SessionIdSchema,
      })
      .strict(),
  },
).strict();

export const SessionReadyCheckPassedEventV2Schema =
  CoreV2EventEnvelopeSchema.extend({
    ...sessionEventBase,
    aggregateId: SessionIdSchema,
    eventType: z.literal('session.ready_check_passed.v2'),
    payload: z
      .object({
        checkId: z.string().uuid(),
        passedAt: z.string().datetime({ offset: true }),
        participantPlayerIds: z.array(PlayerIdSchema).min(2).max(5),
        sessionId: SessionIdSchema,
      })
      .strict(),
  }).strict();

export const SessionScheduledEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...sessionEventBase,
  aggregateId: SessionIdSchema,
  eventType: z.literal('session.scheduled.v2'),
  payload: z
    .object({
      scheduledFor: z.string().datetime({ offset: true }),
      sessionId: SessionIdSchema,
      timezone: z.string().min(1).max(64),
    })
    .strict(),
}).strict();

export const SessionStartedEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...sessionEventBase,
  aggregateId: SessionIdSchema,
  eventType: z.literal('session.started.v2'),
  payload: z
    .object({
      participantPlayerIds: z.array(PlayerIdSchema).min(2).max(5),
      sessionId: SessionIdSchema,
      startedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
}).strict();

export const SessionCompletionProposedEventV2Schema =
  CoreV2EventEnvelopeSchema.extend({
    ...sessionEventBase,
    aggregateId: SessionIdSchema,
    eventType: z.literal('session.completion_proposed.v2'),
    payload: z
      .object({
        claim: PlaySessionCompletionClaimV2Schema,
        participantPlayerIds: z.array(PlayerIdSchema).min(2).max(5),
        sessionId: SessionIdSchema,
      })
      .strict(),
  }).strict();

export const SessionCompletedEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...sessionEventBase,
  aggregateId: SessionIdSchema,
  eventType: z.literal('session.completed.v2'),
  payload: z
    .object({
      completedAt: z.string().datetime({ offset: true }),
      participantPlayerIds: z.array(PlayerIdSchema).min(2).max(5),
      roleAssignments: z.array(PlaySessionRoleAssignmentV2Schema).max(5),
      sessionId: SessionIdSchema,
      source: PlaySessionSourceV2Schema,
      startedAt: z.string().datetime({ offset: true }),
      verification: z.literal('participant_quorum'),
    })
    .strict(),
}).strict();

export const SessionCancelledEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...sessionEventBase,
  aggregateId: SessionIdSchema,
  eventType: z.literal('session.cancelled.v2'),
  payload: z
    .object({
      cancelledAt: z.string().datetime({ offset: true }),
      reasonCode: z.string().min(1).max(64),
      sessionId: SessionIdSchema,
    })
    .strict(),
}).strict();

export const SessionDisputedEventV2Schema = CoreV2EventEnvelopeSchema.extend({
  ...sessionEventBase,
  aggregateId: SessionIdSchema,
  eventType: z.literal('session.disputed.v2'),
  payload: z
    .object({
      claim: PlaySessionCompletionClaimV2Schema,
      disputeWindowClosesAt: z.string().datetime({ offset: true }),
      sessionId: SessionIdSchema,
    })
    .strict(),
}).strict();
