import { z } from 'zod';

import {
  ConversationIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
  SetIdSchema,
} from '../../core-v1';
import { PlaySessionIdSchema } from '../identity/semantic-ids';
import {
  CoreV2CreateCommandMetadataSchema,
  CoreV2MutationCommandMetadataSchema,
  CoreV2ReceiptBaseSchema,
} from '../commands/command';
import {
  SessionCompletionClaimV2IdSchema,
  SessionInviteV2IdSchema,
  SessionReadyCheckV2IdSchema,
  SessionRoleAssignmentV2IdSchema,
} from '../identity/semantic-ids';

export const PlaySessionStateV2Schema = z.enum([
  'draft',
  'recruiting',
  'ready_check',
  'scheduled',
  'in_progress',
  'completion_pending',
  'completed',
  'cancelled',
  'expired',
  'abandoned',
  'disputed',
]);
export const PlaySessionMemberRoleV2Schema = z.enum(['owner', 'member']);
export const PlaySessionMemberStateV2Schema = z.enum([
  'active',
  'left',
  'removed',
]);
export const PlaySessionInviteStateV2Schema = z.enum([
  'pending',
  'accepted',
  'declined',
  'cancelled',
  'expired',
]);
export const PlaySessionReadyCheckStateV2Schema = z.enum([
  'open',
  'passed',
  'failed',
  'expired',
  'cancelled',
]);
export const PlaySessionReadyResponseV2Schema = z.enum(['ready', 'not_ready']);
export const PlaySessionCompletionClaimKindV2Schema = z.enum([
  'completed',
  'disputed',
  'no_show',
]);
export const PlaySessionCancellationReasonV2Schema = z.enum([
  'owner_cancelled',
  'member_unavailable',
  'ready_check_failed',
  'schedule_conflict',
  'safety_block',
  'moderation',
  'other',
]);

export const PlaySessionSourceV2Schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manual') }).strict(),
  z.object({ kind: z.literal('match'), matchId: MatchIdSchema }).strict(),
  z.object({ kind: z.literal('set'), setId: SetIdSchema }).strict(),
]);

export const PlaySessionMemberV2Schema = z
  .object({
    joinedAt: z.string().datetime({ offset: true }),
    leftAt: z.string().datetime({ offset: true }).nullable(),
    playerId: PlayerIdSchema,
    role: PlaySessionMemberRoleV2Schema,
    state: PlaySessionMemberStateV2Schema,
  })
  .strict();

export const PlaySessionRoleAssignmentV2Schema = z
  .object({
    assignmentId: SessionRoleAssignmentV2IdSchema,
    assignedAt: z.string().datetime({ offset: true }),
    playerId: PlayerIdSchema,
    roleSlug: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .min(1)
      .max(32),
  })
  .strict();

export const PlaySessionReadyResponseSnapshotV2Schema = z
  .object({
    playerId: PlayerIdSchema,
    respondedAt: z.string().datetime({ offset: true }),
    response: PlaySessionReadyResponseV2Schema,
  })
  .strict();

export const PlaySessionReadyCheckSnapshotV2Schema = z
  .object({
    checkId: SessionReadyCheckV2IdSchema,
    deadlineAt: z.string().datetime({ offset: true }),
    openedAt: z.string().datetime({ offset: true }),
    requiredPlayerIds: z.array(PlayerIdSchema).min(2).max(5),
    responses: z.array(PlaySessionReadyResponseSnapshotV2Schema).max(5),
    state: PlaySessionReadyCheckStateV2Schema,
    version: z.number().int().positive(),
  })
  .strict();

export const PlaySessionCompletionClaimV2Schema = z
  .object({
    claimId: SessionCompletionClaimV2IdSchema,
    claimedAt: z.string().datetime({ offset: true }),
    kind: PlaySessionCompletionClaimKindV2Schema,
    playerId: PlayerIdSchema,
    reasonCode: z.string().trim().min(1).max(64).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind !== 'completed' && value.reasonCode === null) {
      context.addIssue({
        code: 'custom',
        message: 'Dispute and no-show claims require a stable reason code.',
        path: ['reasonCode'],
      });
    }
  });

export const SessionCommunicationProjectionV2Schema = z
  .object({
    conversationId: ConversationIdSchema.nullable(),
    membershipVersion: z.number().int().nonnegative(),
    status: z.enum(['pending', 'ready', 'degraded']),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'ready' && value.conversationId === null) {
      context.addIssue({
        code: 'custom',
        message: 'A ready communication projection requires a conversationId.',
        path: ['conversationId'],
      });
    }
  });

export const PlaySessionSnapshotV2Schema = z
  .object({
    cancellationReason: PlaySessionCancellationReasonV2Schema.nullable(),
    cancelledAt: z.string().datetime({ offset: true }).nullable(),
    capacity: z.number().int().min(2).max(5),
    communication: SessionCommunicationProjectionV2Schema,
    completedAt: z.string().datetime({ offset: true }).nullable(),
    completionClaims: z.array(PlaySessionCompletionClaimV2Schema).max(20),
    createdAt: z.string().datetime({ offset: true }),
    members: z.array(PlaySessionMemberV2Schema).min(1).max(20),
    ownerPlayerId: PlayerIdSchema,
    readyCheck: PlaySessionReadyCheckSnapshotV2Schema.nullable(),
    roleAssignments: z.array(PlaySessionRoleAssignmentV2Schema).max(5),
    scheduledFor: z.string().datetime({ offset: true }).nullable(),
    sessionId: PlaySessionIdSchema,
    source: PlaySessionSourceV2Schema,
    startedAt: z.string().datetime({ offset: true }).nullable(),
    state: PlaySessionStateV2Schema,
    timezone: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(80),
    updatedAt: z.string().datetime({ offset: true }),
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    const activeMembers = value.members.filter(
      (member) => member.state === 'active',
    );
    const owners = activeMembers.filter((member) => member.role === 'owner');
    if (owners.length !== 1 || owners[0]?.playerId !== value.ownerPlayerId) {
      context.addIssue({
        code: 'custom',
        message: 'A Play Session must have exactly one active canonical owner.',
        path: ['members'],
      });
    }
    if (activeMembers.length > value.capacity) {
      context.addIssue({
        code: 'custom',
        message: 'Active Play Session membership cannot exceed capacity.',
        path: ['members'],
      });
    }
    if (value.state === 'in_progress' && value.startedAt === null) {
      context.addIssue({
        code: 'custom',
        message: 'An in-progress session requires startedAt.',
        path: ['startedAt'],
      });
    }
    if (value.state === 'completed' && value.completedAt === null) {
      context.addIssue({
        code: 'custom',
        message: 'A completed session requires completedAt.',
        path: ['completedAt'],
      });
    }
    if (value.state === 'cancelled' && value.cancellationReason === null) {
      context.addIssue({
        code: 'custom',
        message: 'A cancelled session requires a cancellation reason.',
        path: ['cancellationReason'],
      });
    }
  });

const SessionCreateFieldsSchema = z
  .object({
    capacity: z.number().int().min(2).max(5),
    initialInviteePlayerIds: z.array(PlayerIdSchema).max(4).default([]),
    scheduledFor: z.string().datetime({ offset: true }).nullable(),
    timezone: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(80),
  })
  .strict();

export const CreatePlaySessionCommandV2Schema =
  CoreV2CreateCommandMetadataSchema.extend({
    ...SessionCreateFieldsSchema.shape,
  }).strict();

export const CreateSessionFromMatchCommandV2Schema =
  CoreV2CreateCommandMetadataSchema.extend({
    capacity: z.literal(2),
    matchId: MatchIdSchema,
    scheduledFor: z.string().datetime({ offset: true }).nullable(),
    timezone: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(80),
  }).strict();

export const CreateSessionFromSetCommandV2Schema =
  CoreV2CreateCommandMetadataSchema.extend({
    expectedSourceVersion: z.number().int().positive(),
    scheduledFor: z.string().datetime({ offset: true }).nullable(),
    setId: SetIdSchema,
    timezone: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(80),
  }).strict();

export const InviteToSessionCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    sessionId: PlaySessionIdSchema,
    targetPlayerId: PlayerIdSchema,
  }).strict();

export const AcceptSessionInviteCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    inviteId: SessionInviteV2IdSchema,
    sessionId: PlaySessionIdSchema,
  }).strict();

export const LeaveSessionCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    sessionId: PlaySessionIdSchema,
  }).strict();

export const RemoveSessionMemberCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    memberPlayerId: PlayerIdSchema,
    reasonCode: z.string().trim().min(1).max(64),
    sessionId: PlaySessionIdSchema,
  }).strict();

export const AssignSessionRoleCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    memberPlayerId: PlayerIdSchema,
    roleSlug: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .min(1)
      .max(32),
    sessionId: PlaySessionIdSchema,
  }).strict();

export const OpenReadyCheckCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    deadlineAt: z.string().datetime({ offset: true }),
    sessionId: PlaySessionIdSchema,
  }).strict();

export const RespondReadyCheckCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    checkId: SessionReadyCheckV2IdSchema,
    response: PlaySessionReadyResponseV2Schema,
    sessionId: PlaySessionIdSchema,
  }).strict();

export const ScheduleSessionCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    scheduledFor: z.string().datetime({ offset: true }),
    sessionId: PlaySessionIdSchema,
    timezone: z.string().trim().min(1).max(64),
  }).strict();

export const StartSessionCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    sessionId: PlaySessionIdSchema,
  }).strict();

export const ProposeSessionCompletionCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    claim: PlaySessionCompletionClaimKindV2Schema,
    reasonCode: z.string().trim().min(1).max(64).nullable(),
    sessionId: PlaySessionIdSchema,
  })
    .strict()
    .superRefine((value, context) => {
      if (value.claim !== 'completed' && value.reasonCode === null) {
        context.addIssue({
          code: 'custom',
          message: 'Dispute and no-show claims require a stable reason code.',
          path: ['reasonCode'],
        });
      }
    });

export const CancelSessionCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    reason: PlaySessionCancellationReasonV2Schema,
    sessionId: PlaySessionIdSchema,
  }).strict();

export const PlaySessionCommandNameV2Schema = z.enum([
  'create_play_session_v2',
  'create_session_from_match_v2',
  'create_session_from_set_v2',
  'invite_to_session_v2',
  'accept_session_invite_v2',
  'leave_session_v2',
  'remove_session_member_v2',
  'assign_session_role_v2',
  'open_ready_check_v2',
  'respond_ready_check_v2',
  'schedule_session_v2',
  'start_session_v2',
  'propose_session_completion_v2',
  'cancel_session_v2',
]);

export const PlaySessionCommandReceiptV2Schema = CoreV2ReceiptBaseSchema.extend(
  {
    aggregateType: z.literal('play_session'),
    commandName: PlaySessionCommandNameV2Schema,
    resultCode: z.enum([
      'created',
      'invite_pending',
      'invite_accepted',
      'member_left',
      'member_removed',
      'role_assigned',
      'ready_check_opened',
      'ready_recorded',
      'ready_check_passed',
      'scheduled',
      'started',
      'completion_pending',
      'completed',
      'disputed',
      'cancelled',
    ]),
    session: PlaySessionSnapshotV2Schema,
  },
).strict();

export const PlaySessionCapabilitiesV2Schema = z
  .object({
    canAssignRole: z.boolean(),
    canCancel: z.boolean(),
    canInvite: z.boolean(),
    canLeave: z.boolean(),
    canOpenReadyCheck: z.boolean(),
    canProposeCompletion: z.boolean(),
    canRemoveMember: z.boolean(),
    canRespondReady: z.boolean(),
    canSchedule: z.boolean(),
    canStart: z.boolean(),
    denialReasonCodes: z.array(z.string().min(1).max(64)).max(20),
  })
  .strict();

export type PlaySessionSnapshotV2 = z.infer<typeof PlaySessionSnapshotV2Schema>;
export type PlaySessionCommandReceiptV2 = z.infer<
  typeof PlaySessionCommandReceiptV2Schema
>;
export type PlaySessionCapabilitiesV2 = z.infer<
  typeof PlaySessionCapabilitiesV2Schema
>;
export type CreatePlaySessionCommandV2 = z.infer<
  typeof CreatePlaySessionCommandV2Schema
>;
export type CreateSessionFromMatchCommandV2 = z.infer<
  typeof CreateSessionFromMatchCommandV2Schema
>;
export type InviteToSessionCommandV2 = z.infer<
  typeof InviteToSessionCommandV2Schema
>;
export type AcceptSessionInviteCommandV2 = z.infer<
  typeof AcceptSessionInviteCommandV2Schema
>;
export type OpenReadyCheckCommandV2 = z.infer<
  typeof OpenReadyCheckCommandV2Schema
>;
export type RespondReadyCheckCommandV2 = z.infer<
  typeof RespondReadyCheckCommandV2Schema
>;
export type ScheduleSessionCommandV2 = z.infer<
  typeof ScheduleSessionCommandV2Schema
>;
export type StartSessionCommandV2 = z.infer<typeof StartSessionCommandV2Schema>;
export type ProposeSessionCompletionCommandV2 = z.infer<
  typeof ProposeSessionCompletionCommandV2Schema
>;
export type CancelSessionCommandV2 = z.infer<
  typeof CancelSessionCommandV2Schema
>;
export type CreateSessionFromSetCommandV2 = z.infer<
  typeof CreateSessionFromSetCommandV2Schema
>;
export type LeaveSessionCommandV2 = z.infer<typeof LeaveSessionCommandV2Schema>;
export type RemoveSessionMemberCommandV2 = z.infer<
  typeof RemoveSessionMemberCommandV2Schema
>;
export type AssignSessionRoleCommandV2 = z.infer<
  typeof AssignSessionRoleCommandV2Schema
>;
