import type { AuthSession } from '@/shared/auth/auth-service';
import {
  CreateSetInviteCommandV1Schema,
  EventIdSchema,
  PlayerIdSchema,
  RequestSetJoinCommandV1Schema,
  SetIdSchema,
  type PlayerId,
  type SetDiscoveryPageV1,
  type SetInviteReceiptV1,
  type SetJoinRequestReceiptV1,
} from '@/shared/contracts/core-v1';
import {
  AcceptSetInviteCommandV2Schema,
  AcceptSetJoinRequestCommandV2Schema,
  CancelSetInviteCommandV2Schema,
  CancelSetJoinRequestCommandV2Schema,
  CloseMatchSetCommandV2Schema,
  CreateMatchSetCommandV2Schema,
  DeclineSetInviteCommandV2Schema,
  InviteToSetCommandV2Schema,
  LeaveSetCommandV2Schema,
  MatchSetCommandReceiptV2Schema,
  MatchSetDashboardV2Schema,
  MatchSetSnapshotV2Schema,
  RejectSetJoinRequestCommandV2Schema,
  RemoveSetMemberCommandV2Schema,
  ReopenMatchSetCommandV2Schema,
  RequestSetJoinCommandV2Schema,
  SetInviteV2IdSchema,
  SetJoinRequestV2IdSchema,
  TransferSetOwnershipCommandV2Schema,
  UpdateMatchSetCommandV2Schema,
  type MatchSetCommandReceiptV2,
  type MatchSetInviteProjectionV2,
  type MatchSetJoinRequestProjectionV2,
  type MatchSetSnapshotV2,
} from '@/shared/contracts/core-v2';
import { createRuntimeUuid } from '@/shared/core-v2';

import type { MatchSetRepository } from './match-set-repository';

export class InMemoryMatchSetRepository implements MatchSetRepository {
  private readonly inviteReceipts = new Map<string, SetInviteReceiptV1>();
  private readonly joinReceipts = new Map<string, SetJoinRequestReceiptV1>();
  private readonly sets = new Map<string, MatchSetSnapshotV2>();
  private incomingInvites: MatchSetInviteProjectionV2[] = [];
  private outgoingInvites: MatchSetInviteProjectionV2[] = [];
  private incomingJoinRequests: MatchSetJoinRequestProjectionV2[] = [];
  private outgoingJoinRequests: MatchSetJoinRequestProjectionV2[] = [];

  constructor(
    private readonly page: SetDiscoveryPageV1 = {
      items: [],
      nextCursor: null,
      snapshot: {
        createdAt: new Date(0).toISOString(),
        expiresAt: new Date(10 * 60 * 1000).toISOString(),
        intentVersion: 1,
        snapshotId: 'a2000000-0000-4000-8000-000000000001' as never,
      },
    },
  ) {
    for (const candidate of page.items) {
      const set = candidate.set;
      this.sets.set(
        set.setId,
        MatchSetSnapshotV2Schema.parse({
          capacity: set.capacity,
          closeReason: set.state === 'closed' ? 'owner_closed' : null,
          closedAt: set.state === 'closed' ? set.createdAt : null,
          createdAt: set.createdAt,
          expiresAt: null,
          intentKind: set.intentKind,
          members: set.memberPlayerIds.map((playerId) => ({
            joinedAt: set.createdAt,
            leftAt: null,
            playerId,
            role: playerId === set.ownerPlayerId ? 'owner' : 'member',
            state: 'active',
          })),
          ownerPlayerId: set.ownerPlayerId,
          setId: SetIdSchema.parse(set.setId),
          state: set.state,
          title: set.title,
          updatedAt: set.createdAt,
          version: set.version,
        }),
      );
    }
  }

  async dashboard() {
    return MatchSetDashboardV2Schema.parse({
      incomingInvites: this.incomingInvites,
      incomingJoinRequests: this.incomingJoinRequests,
      outgoingInvites: this.outgoingInvites,
      outgoingJoinRequests: this.outgoingJoinRequests,
      sets: [...this.sets.values()].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
    });
  }

  async get(_session: AuthSession, setId: string) {
    return this.sets.get(setId) ?? null;
  }

  async list() {
    return this.page;
  }

  async createSet(session: AuthSession, command: unknown) {
    const input = CreateMatchSetCommandV2Schema.parse(command);
    const now = new Date().toISOString();
    const ownerPlayerId = actorPlayerId(session);
    const set = MatchSetSnapshotV2Schema.parse({
      capacity: input.capacity,
      closeReason: null,
      closedAt: null,
      createdAt: now,
      expiresAt: input.expiresAt,
      intentKind: input.intentKind,
      members: [
        {
          joinedAt: now,
          leftAt: null,
          playerId: ownerPlayerId,
          role: 'owner',
          state: 'active',
        },
      ],
      ownerPlayerId,
      setId: SetIdSchema.parse(createRuntimeUuid()),
      state: 'open',
      title: input.title,
      updatedAt: now,
      version: 1,
    });
    this.sets.set(set.setId, set);
    return receipt('create_match_set_v2', 'created', input, set);
  }

  async updateSet(_session: AuthSession, command: unknown) {
    const input = UpdateMatchSetCommandV2Schema.parse(command);
    const current = this.requireVersion(input.setId, input.expectedVersion);
    const activeCount = activeMembers(current).length;
    if (input.capacity < activeCount) throw new Error('capacity_exceeded');
    const set = this.save({
      ...current,
      capacity: input.capacity,
      expiresAt: input.expiresAt,
      intentKind: input.intentKind,
      state: activeCount >= input.capacity ? 'full' : 'open',
      title: input.title,
    });
    return receipt('update_match_set_v2', 'updated', input, set);
  }

  async closeSet(_session: AuthSession, command: unknown) {
    const input = CloseMatchSetCommandV2Schema.parse(command);
    const current = this.requireVersion(input.setId, input.expectedVersion);
    const now = new Date().toISOString();
    const set = this.save({
      ...current,
      closeReason: input.reason,
      closedAt: now,
      state: input.reason === 'expired' ? 'expired' : 'closed',
    });
    return receipt('close_match_set_v2', 'closed', input, set);
  }

  async reopenSet(_session: AuthSession, command: unknown) {
    const input = ReopenMatchSetCommandV2Schema.parse(command);
    const current = this.requireVersion(input.setId, input.expectedVersion);
    const set = this.save({
      ...current,
      closeReason: null,
      closedAt: null,
      state:
        activeMembers(current).length >= current.capacity ? 'full' : 'open',
    });
    return receipt('reopen_match_set_v2', 'reopened', input, set);
  }

  async inviteToSet(_session: AuthSession, command: unknown) {
    const input = InviteToSetCommandV2Schema.parse(command);
    const set = this.save(
      this.requireVersion(input.setId, input.expectedVersion),
    );
    const projection = {
      createdAt: new Date().toISOString(),
      expiresAt: null,
      inviteId: SetInviteV2IdSchema.parse(createRuntimeUuid()),
      inviterPlayerId: set.ownerPlayerId,
      set,
      state: 'pending' as const,
      targetPlayerId: input.targetPlayerId,
      version: 1,
    };
    this.outgoingInvites = [...this.outgoingInvites, projection];
    return receipt('invite_to_set_v2', 'invite_pending', input, set);
  }

  async acceptInvite(session: AuthSession, command: unknown) {
    const input = AcceptSetInviteCommandV2Schema.parse(command);
    const current = this.requireVersion(input.setId, input.expectedVersion);
    const playerId = actorPlayerId(session);
    const set = this.addMember(current, playerId);
    this.incomingInvites = this.incomingInvites.filter(
      (item) => item.inviteId !== input.inviteId,
    );
    this.outgoingInvites = this.outgoingInvites.filter(
      (item) => item.inviteId !== input.inviteId,
    );
    return receipt('accept_set_invite_v2', 'invite_accepted', input, set);
  }

  async declineInvite(_session: AuthSession, command: unknown) {
    const input = DeclineSetInviteCommandV2Schema.parse(command);
    const set = this.save(
      this.requireVersion(input.setId, input.expectedVersion),
    );
    this.incomingInvites = this.incomingInvites.filter(
      (item) => item.inviteId !== input.inviteId,
    );
    this.outgoingInvites = this.outgoingInvites.filter(
      (item) => item.inviteId !== input.inviteId,
    );
    return receipt('decline_set_invite_v2', 'invite_declined', input, set);
  }

  async cancelInvite(_session: AuthSession, command: unknown) {
    const input = CancelSetInviteCommandV2Schema.parse(command);
    const set = this.save(
      this.requireVersion(input.setId, input.expectedVersion),
    );
    this.incomingInvites = this.incomingInvites.filter(
      (item) => item.inviteId !== input.inviteId,
    );
    this.outgoingInvites = this.outgoingInvites.filter(
      (item) => item.inviteId !== input.inviteId,
    );
    return receipt('cancel_set_invite_v2', 'invite_cancelled', input, set);
  }

  async requestJoinV2(session: AuthSession, command: unknown) {
    const input = RequestSetJoinCommandV2Schema.parse(command);
    const set = this.save(
      this.requireVersion(input.setId, input.expectedVersion),
    );
    const projection = {
      createdAt: new Date().toISOString(),
      expiresAt: null,
      joinRequestId: SetJoinRequestV2IdSchema.parse(createRuntimeUuid()),
      requesterPlayerId: actorPlayerId(session),
      set,
      state: 'pending' as const,
      version: 1,
    };
    this.outgoingJoinRequests = [...this.outgoingJoinRequests, projection];
    return receipt('request_set_join_v2', 'join_pending', input, set);
  }

  async acceptJoinRequest(_session: AuthSession, command: unknown) {
    const input = AcceptSetJoinRequestCommandV2Schema.parse(command);
    const current = this.requireVersion(input.setId, input.expectedVersion);
    const projection = this.incomingJoinRequests.find(
      (item) => item.joinRequestId === input.joinRequestId,
    );
    if (!projection) throw new Error('not_found');
    const set = this.addMember(current, projection.requesterPlayerId);
    this.removeJoinRequest(input.joinRequestId);
    return receipt('accept_set_join_request_v2', 'join_accepted', input, set);
  }

  async rejectJoinRequest(_session: AuthSession, command: unknown) {
    const input = RejectSetJoinRequestCommandV2Schema.parse(command);
    const set = this.save(
      this.requireVersion(input.setId, input.expectedVersion),
    );
    this.removeJoinRequest(input.joinRequestId);
    return receipt('reject_set_join_request_v2', 'join_rejected', input, set);
  }

  async cancelJoinRequest(_session: AuthSession, command: unknown) {
    const input = CancelSetJoinRequestCommandV2Schema.parse(command);
    const set = this.save(
      this.requireVersion(input.setId, input.expectedVersion),
    );
    this.removeJoinRequest(input.joinRequestId);
    return receipt('cancel_set_join_request_v2', 'join_cancelled', input, set);
  }

  async leaveSet(session: AuthSession, command: unknown) {
    const input = LeaveSetCommandV2Schema.parse(command);
    const current = this.requireVersion(input.setId, input.expectedVersion);
    const playerId = actorPlayerId(session);
    const set = this.save({
      ...current,
      members: current.members.map((member) =>
        member.playerId === playerId && member.state === 'active'
          ? {
              ...member,
              leftAt: new Date().toISOString(),
              state: 'left' as const,
            }
          : member,
      ),
      state: 'open',
    });
    return receipt('leave_set_v2', 'member_left', input, set);
  }

  async removeMember(_session: AuthSession, command: unknown) {
    const input = RemoveSetMemberCommandV2Schema.parse(command);
    const current = this.requireVersion(input.setId, input.expectedVersion);
    const set = this.save({
      ...current,
      members: current.members.map((member) =>
        member.playerId === input.memberPlayerId && member.state === 'active'
          ? {
              ...member,
              leftAt: new Date().toISOString(),
              state: 'removed' as const,
            }
          : member,
      ),
      state: 'open',
    });
    return receipt('remove_set_member_v2', 'member_removed', input, set);
  }

  async transferOwnership(_session: AuthSession, command: unknown) {
    const input = TransferSetOwnershipCommandV2Schema.parse(command);
    const current = this.requireVersion(input.setId, input.expectedVersion);
    const set = this.save({
      ...current,
      members: current.members.map((member) => ({
        ...member,
        role:
          member.playerId === input.targetPlayerId
            ? ('owner' as const)
            : member.role === 'owner'
              ? ('member' as const)
              : member.role,
      })),
      ownerPlayerId: input.targetPlayerId,
    });
    return receipt(
      'transfer_set_ownership_v2',
      'ownership_transferred',
      input,
      set,
    );
  }

  async invite(_session: AuthSession, command: unknown) {
    const input = CreateSetInviteCommandV1Schema.parse(command);
    const replay = this.inviteReceipts.get(input.idempotencyKey);
    if (replay) return { ...replay, repeated: true };
    const receiptValue: SetInviteReceiptV1 = {
      createdAt: new Date().toISOString(),
      inviteId: createRuntimeUuid() as never,
      repeated: false,
      setId: input.setId,
      state: 'pending',
      targetPlayerId: input.targetPlayerId,
    };
    this.inviteReceipts.set(input.idempotencyKey, receiptValue);
    return receiptValue;
  }

  async requestJoin(_session: AuthSession, command: unknown) {
    const input = RequestSetJoinCommandV1Schema.parse(command);
    const replay = this.joinReceipts.get(input.idempotencyKey);
    if (replay) return { ...replay, repeated: true };
    const receiptValue: SetJoinRequestReceiptV1 = {
      createdAt: new Date().toISOString(),
      joinRequestId: createRuntimeUuid() as never,
      repeated: false,
      setId: input.setId,
      state: 'pending',
    };
    this.joinReceipts.set(input.idempotencyKey, receiptValue);
    return receiptValue;
  }

  private addMember(current: MatchSetSnapshotV2, playerId: PlayerId) {
    const existing = current.members.find((item) => item.playerId === playerId);
    if (existing?.state === 'active') return this.save(current);
    const now = new Date().toISOString();
    const members = existing
      ? current.members.map((member) =>
          member.playerId === playerId
            ? {
                ...member,
                joinedAt: now,
                leftAt: null,
                state: 'active' as const,
              }
            : member,
        )
      : [
          ...current.members,
          {
            joinedAt: now,
            leftAt: null,
            playerId,
            role: 'member' as const,
            state: 'active' as const,
          },
        ];
    return this.save({
      ...current,
      members,
      state:
        activeMembers({ ...current, members }).length >= current.capacity
          ? 'full'
          : 'open',
    });
  }

  private removeJoinRequest(joinRequestId: string) {
    this.incomingJoinRequests = this.incomingJoinRequests.filter(
      (item) => item.joinRequestId !== joinRequestId,
    );
    this.outgoingJoinRequests = this.outgoingJoinRequests.filter(
      (item) => item.joinRequestId !== joinRequestId,
    );
  }

  private requireVersion(setId: string, expectedVersion: number) {
    const set = this.sets.get(setId);
    if (!set) throw new Error('not_found');
    if (set.version !== expectedVersion) throw new Error('version_conflict');
    return set;
  }

  private save(input: MatchSetSnapshotV2) {
    const set = MatchSetSnapshotV2Schema.parse({
      ...input,
      updatedAt: new Date().toISOString(),
      version: input.version + 1,
    });
    this.sets.set(set.setId, set);
    return set;
  }
}

function actorPlayerId(session: AuthSession) {
  return PlayerIdSchema.parse(
    session.principal?.playerId ??
      session.lifecycle?.playerId ??
      session.user.id,
  );
}

function activeMembers(set: Pick<MatchSetSnapshotV2, 'members'>) {
  return set.members.filter((member) => member.state === 'active');
}

function receipt(
  commandName: MatchSetCommandReceiptV2['commandName'],
  resultCode: MatchSetCommandReceiptV2['resultCode'],
  metadata: Readonly<{ correlationId: string }>,
  set: MatchSetSnapshotV2,
) {
  return MatchSetCommandReceiptV2Schema.parse({
    aggregateId: set.setId,
    aggregateType: 'match_set',
    aggregateVersion: set.version,
    commandName,
    correlationId: metadata.correlationId,
    eventIds: [EventIdSchema.parse(createRuntimeUuid())],
    occurredAt: new Date().toISOString(),
    repeated: false,
    resultCode,
    set,
  });
}
