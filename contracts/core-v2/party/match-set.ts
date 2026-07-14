import { z } from 'zod';

import { PlayerIdSchema, SetIdSchema } from '../../core-v1';
import {
  CoreV2CreateCommandMetadataSchema,
  CoreV2MutationCommandMetadataSchema,
  CoreV2ReceiptBaseSchema,
} from '../commands/command';
import {
  SetInviteV2IdSchema,
  SetJoinRequestV2IdSchema,
} from '../identity/semantic-ids';

export const MatchSetStateV2Schema = z.enum([
  'open',
  'full',
  'closed',
  'expired',
]);
export const MatchSetMemberRoleV2Schema = z.enum(['owner', 'member']);
export const MatchSetMemberStateV2Schema = z.enum([
  'active',
  'left',
  'removed',
]);
export const MatchSetInviteStateV2Schema = z.enum([
  'pending',
  'accepted',
  'declined',
  'cancelled',
  'expired',
]);
export const MatchSetJoinRequestStateV2Schema = z.enum([
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'expired',
]);
export const MatchSetCloseReasonV2Schema = z.enum([
  'owner_closed',
  'converted_to_session',
  'expired',
  'moderation',
]);

export const MatchSetMemberV2Schema = z
  .object({
    joinedAt: z.string().datetime({ offset: true }),
    leftAt: z.string().datetime({ offset: true }).nullable(),
    playerId: PlayerIdSchema,
    role: MatchSetMemberRoleV2Schema,
    state: MatchSetMemberStateV2Schema,
  })
  .strict();

export const MatchSetSnapshotV2Schema = z
  .object({
    capacity: z.number().int().min(2).max(5),
    closeReason: MatchSetCloseReasonV2Schema.nullable(),
    closedAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    intentKind: z.string().trim().min(1).max(32),
    members: z.array(MatchSetMemberV2Schema).min(1).max(20),
    ownerPlayerId: PlayerIdSchema,
    setId: SetIdSchema,
    state: MatchSetStateV2Schema,
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
        message: 'A Match Set must have exactly one active canonical owner.',
        path: ['members'],
      });
    }
    if (activeMembers.length > value.capacity) {
      context.addIssue({
        code: 'custom',
        message: 'Active Match Set membership cannot exceed capacity.',
        path: ['members'],
      });
    }
    if (value.state === 'full' && activeMembers.length !== value.capacity) {
      context.addIssue({
        code: 'custom',
        message: 'A full Match Set must have exactly capacity active members.',
        path: ['state'],
      });
    }
  });

export const CreateMatchSetCommandV2Schema =
  CoreV2CreateCommandMetadataSchema.extend({
    capacity: z.number().int().min(2).max(5),
    intentKind: z.string().trim().min(1).max(32),
    title: z.string().trim().min(1).max(80),
  }).strict();

export const UpdateMatchSetCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    capacity: z.number().int().min(2).max(5).optional(),
    setId: SetIdSchema,
    title: z.string().trim().min(1).max(80).optional(),
  })
    .strict()
    .refine(
      (value) => value.capacity !== undefined || value.title !== undefined,
      {
        message: 'At least one Match Set field must change.',
      },
    );

export const CloseMatchSetCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    reason: MatchSetCloseReasonV2Schema,
    setId: SetIdSchema,
  }).strict();

export const ReopenMatchSetCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    setId: SetIdSchema,
  }).strict();

export const InviteToSetCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    setId: SetIdSchema,
    targetPlayerId: PlayerIdSchema,
  }).strict();

const SetInviteMutationCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    inviteId: SetInviteV2IdSchema,
    setId: SetIdSchema,
  }).strict();
export const AcceptSetInviteCommandV2Schema = SetInviteMutationCommandV2Schema;
export const DeclineSetInviteCommandV2Schema = SetInviteMutationCommandV2Schema;
export const CancelSetInviteCommandV2Schema = SetInviteMutationCommandV2Schema;

export const RequestSetJoinCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    setId: SetIdSchema,
  }).strict();

const SetJoinRequestMutationCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    joinRequestId: SetJoinRequestV2IdSchema,
    setId: SetIdSchema,
  }).strict();
export const AcceptSetJoinRequestCommandV2Schema =
  SetJoinRequestMutationCommandV2Schema;
export const RejectSetJoinRequestCommandV2Schema =
  SetJoinRequestMutationCommandV2Schema;
export const CancelSetJoinRequestCommandV2Schema =
  SetJoinRequestMutationCommandV2Schema;

export const LeaveSetCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    setId: SetIdSchema,
  }).strict();

export const RemoveSetMemberCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    memberPlayerId: PlayerIdSchema,
    reasonCode: z.string().trim().min(1).max(64),
    setId: SetIdSchema,
  }).strict();

export const TransferSetOwnershipCommandV2Schema =
  CoreV2MutationCommandMetadataSchema.extend({
    setId: SetIdSchema,
    targetPlayerId: PlayerIdSchema,
  }).strict();

export const MatchSetCommandNameV2Schema = z.enum([
  'create_match_set_v2',
  'update_match_set_v2',
  'close_match_set_v2',
  'reopen_match_set_v2',
  'invite_to_set_v2',
  'accept_set_invite_v2',
  'decline_set_invite_v2',
  'cancel_set_invite_v2',
  'request_set_join_v2',
  'accept_set_join_request_v2',
  'reject_set_join_request_v2',
  'cancel_set_join_request_v2',
  'leave_set_v2',
  'remove_set_member_v2',
  'transfer_set_ownership_v2',
]);

export const MatchSetCommandReceiptV2Schema = CoreV2ReceiptBaseSchema.extend({
  aggregateType: z.literal('match_set'),
  commandName: MatchSetCommandNameV2Schema,
  resultCode: z.enum([
    'created',
    'updated',
    'closed',
    'reopened',
    'invite_pending',
    'invite_accepted',
    'invite_declined',
    'invite_cancelled',
    'join_pending',
    'join_accepted',
    'join_rejected',
    'join_cancelled',
    'member_left',
    'member_removed',
    'ownership_transferred',
  ]),
  set: MatchSetSnapshotV2Schema,
}).strict();

export type MatchSetSnapshotV2 = z.infer<typeof MatchSetSnapshotV2Schema>;
export type MatchSetCommandReceiptV2 = z.infer<
  typeof MatchSetCommandReceiptV2Schema
>;
export type CreateMatchSetCommandV2 = z.infer<
  typeof CreateMatchSetCommandV2Schema
>;
