import {
  ConversationMemberAddedEventV2Schema,
  ConversationMemberRemovedEventV2Schema,
  ConversationSourceBindingV2Schema,
  ConversationSourceBoundEventV2Schema,
  RelationshipConversationAccessEventV2Schema,
  RelationshipConversationProjectionInputV2Schema,
  RelationshipConversationProjectionReceiptV2Schema,
  type AuthoritativeConversationMemberV2,
  type ConversationAccessReasonV2,
  type ConversationCommandReceiptV2,
  type ConversationEventV2,
  type ConversationMemberV2,
  type ConversationReadCursorV2,
  type ConversationSnapshotV2,
  type ConversationSourceBindingV2,
  type ConversationSourceV2,
  type CoreV2CommandMetadata,
  type MessageV2,
  type RelationshipConversationAccessEventV2,
  type RelationshipConversationProjectionInputV2,
  type RelationshipConversationProjectionReceiptV2,
} from '@/shared/contracts/core-v2';
import {
  IdempotencyKeySchema,
  RequestIdSchema,
  type EventId,
  type PlayerId,
} from '@/shared/contracts/core-v1';

import type { ConversationSystemActivityV2 } from './conversation-v2-provider';
import { ConversationV2ProviderError } from './conversation-v2-error';

export type StoredConversation = {
  snapshot: ConversationSnapshotV2;
  sources: Map<string, ConversationSourceBindingV2>;
  members: Map<string, ConversationMemberV2>;
  membershipVersion: number;
  messages: MessageV2[];
  cursors: Map<string, ConversationReadCursorV2>;
  conversationMutedPlayerIds: Set<string>;
  relationshipMutedPlayerIds: Set<string>;
};

export type StoredRelationshipProjectionReceipt = {
  fingerprint: string;
  receipt: RelationshipConversationProjectionReceiptV2;
};

export type RelationshipProjectionContext = Readonly<{
  directConversationByPair: Map<string, string>;
  eventId: () => EventId;
  eventLog: ConversationEventV2[];
  relationshipObservedVersions: Map<string, number>;
  relationshipProjectionReceipts: Map<
    string,
    StoredRelationshipProjectionReceipt
  >;
  relationshipProjectionVersions: Map<
    string,
    { fingerprint: string; version: number }
  >;
  sourceToConversation: Map<string, string>;
  accessRevokedEvent: (
    stored: StoredConversation,
    playerId: string,
    reason: ConversationAccessReasonV2,
    occurredAt: string,
    actorPlayerId: PlayerId | null,
    correlationId: string,
    causationId: EventId | null,
  ) => ConversationEventV2;
  advanceConversation: (
    stored: StoredConversation,
    occurredAt: string,
    advanceSequence?: boolean,
  ) => ConversationSnapshotV2;
  newMember: (
    member: AuthoritativeConversationMemberV2,
    membershipVersion: number,
    occurredAt: string,
  ) => ConversationMemberV2;
  notifyAccess: (stored: StoredConversation, playerId: string) => void;
  projectSystemActivity: (
    activity: ConversationSystemActivityV2,
  ) => Promise<MessageV2>;
  provision: (
    actor: null,
    input: Readonly<{
      commandName:
        | 'provision_direct_conversation_v2'
        | 'provision_session_conversation_v2';
      kind: 'direct' | 'group';
      members: readonly AuthoritativeConversationMemberV2[];
      membershipVersion: number;
      metadata: CoreV2CommandMetadata;
      source: ConversationSourceV2;
      title: string | null;
    }>,
  ) => Promise<ConversationCommandReceiptV2>;
  requireConversation: (conversationId: string) => StoredConversation;
}>;

export async function applyRelationshipProjection(
  context: RelationshipProjectionContext,
  input: RelationshipConversationProjectionInputV2,
): Promise<RelationshipConversationProjectionReceiptV2> {
  const projection =
    RelationshipConversationProjectionInputV2Schema.parse(input);
  const fingerprint = stableJson(projection);
  const replayKey = projection.sourceEventId;
  const replay = context.relationshipProjectionReceipts.get(replayKey);
  if (replay) {
    if (replay.fingerprint !== fingerprint) {
      throw new ConversationV2ProviderError(
        'event_replay_conflict',
        'Relationship event ID is already bound to different projection facts.',
        false,
      );
    }
    return { ...replay.receipt, repeated: true };
  }

  const relationship = projection.relationship;
  const relationshipFingerprint = stableJson(relationship);
  const observedVersion =
    context.relationshipObservedVersions.get(relationship.relationshipId) ?? 0;
  if (relationship.version < observedVersion) {
    throw new ConversationV2ProviderError(
      'source_version_conflict',
      'Relationship projection version is older than an observed authority event.',
      false,
      { current: observedVersion, requested: relationship.version },
    );
  }
  const projectedVersion = context.relationshipProjectionVersions.get(
    relationship.relationshipId,
  );
  if (projectedVersion) {
    if (relationship.version < projectedVersion.version) {
      throw new ConversationV2ProviderError(
        'source_version_conflict',
        'Relationship projection version is stale.',
        false,
        {
          current: projectedVersion.version,
          requested: relationship.version,
        },
      );
    }
    if (
      relationship.version === projectedVersion.version &&
      relationshipFingerprint !== projectedVersion.fingerprint
    ) {
      throw new ConversationV2ProviderError(
        'event_replay_conflict',
        'Relationship version is already bound to different facts.',
        false,
      );
    }
  }
  const pair = directPairKey([
    relationship.viewerPlayerId,
    relationship.targetPlayerId,
  ]);
  const friendshipSource: ConversationSourceV2 = {
    sourceType: 'friendship',
    sourceId: relationship.relationshipId,
    sourceAggregateVersion: Math.max(1, relationship.version),
  };
  const eventIds: EventId[] = [];
  let conversationId = context.directConversationByPair.get(pair) ?? null;
  let action: RelationshipConversationProjectionReceiptV2['action'] = 'none';

  const acceptedFriendship =
    relationship.friendship.state === 'accepted' &&
    relationship.friendship.label === 'friend';
  if (!conversationId && acceptedFriendship) {
    const provisionReceipt = await context.provision(null, {
      commandName: 'provision_direct_conversation_v2',
      kind: 'direct',
      members: [
        { playerId: relationship.viewerPlayerId, role: 'member' },
        { playerId: relationship.targetPlayerId, role: 'member' },
      ],
      membershipVersion: friendshipSource.sourceAggregateVersion,
      metadata: {
        idempotencyKey: IdempotencyKeySchema.parse(
          `relationship-projection:${projection.sourceEventId}`,
        ),
        correlationId: projection.correlationId,
        causationId: projection.sourceEventId,
        expectedAggregateVersion: 0,
        audit: {
          requestId: RequestIdSchema.parse(
            `relationship-${projection.sourceEventId}`,
          ),
          clientCreatedAt: projection.occurredAt,
          clientPlatform: 'service',
          clientVersion: 'core-v2-social-projection',
        },
      },
      source: friendshipSource,
      title: null,
    });
    conversationId = provisionReceipt.conversationId;
    eventIds.push(provisionReceipt.eventId);
    action = 'provisioned';
  }

  if (!conversationId) {
    const receipt = RelationshipConversationProjectionReceiptV2Schema.parse({
      action,
      conversationId: null,
      relationshipId: relationship.relationshipId,
      relationshipVersion: relationship.version,
      sourceEventId: projection.sourceEventId,
      eventIds,
      repeated: false,
    });
    context.relationshipProjectionReceipts.set(replayKey, {
      fingerprint,
      receipt,
    });
    context.relationshipProjectionVersions.set(relationship.relationshipId, {
      version: relationship.version,
      fingerprint: relationshipFingerprint,
    });
    context.relationshipObservedVersions.set(
      relationship.relationshipId,
      Math.max(observedVersion, relationship.version),
    );
    return receipt;
  }

  const stored = context.requireConversation(conversationId);
  const sourceKeyValue = sourceKey(friendshipSource);
  const currentSourceBinding = stored.sources.get(sourceKeyValue);
  const blocked = relationship.capabilities.blocked;
  const canViewConversation = blocked
    ? false
    : relationship.capabilities.canViewConversation;
  const canMessage =
    canViewConversation && !blocked && relationship.capabilities.canMessage;
  const reason: ConversationAccessReasonV2 = blocked
    ? 'blocked'
    : 'source_membership_revoked';
  const now = projection.occurredAt;
  const transitions: {
    kind: 'added' | 'removed';
    member: ConversationMemberV2;
  }[] = [];
  let accessChanged = false;

  for (const playerId of [
    relationship.viewerPlayerId,
    relationship.targetPlayerId,
  ]) {
    const existing = stored.members.get(playerId);
    if (!existing) {
      if (!canViewConversation) continue;
      const member = context.newMember(
        { playerId, role: 'member' },
        friendshipSource.sourceAggregateVersion,
        now,
      );
      member.canMessage = canMessage;
      member.canViewConversation = canViewConversation;
      stored.members.set(playerId, member);
      transitions.push({ kind: 'added', member });
      accessChanged = true;
      continue;
    }

    const nextState =
      canViewConversation || canMessage
        ? ('active' as const)
        : ('revoked' as const);
    const changed =
      existing.canMessage !== canMessage ||
      existing.canViewConversation !== canViewConversation ||
      existing.state !== nextState ||
      existing.membershipVersion !== friendshipSource.sourceAggregateVersion;
    if (!changed) continue;
    const previousState = existing.state;
    const member: ConversationMemberV2 = {
      ...existing,
      canMessage,
      canViewConversation,
      state: nextState,
      membershipVersion: friendshipSource.sourceAggregateVersion,
      version: existing.version + 1,
      revokedAt: nextState === 'revoked' ? now : null,
      revocationReason: nextState === 'revoked' ? reason : null,
    };
    stored.members.set(playerId, member);
    accessChanged = true;
    if (previousState !== nextState) {
      transitions.push({
        kind: nextState === 'active' ? 'added' : 'removed',
        member,
      });
    }
  }

  const sourceChanged =
    !currentSourceBinding ||
    currentSourceBinding.source.sourceAggregateVersion !==
      friendshipSource.sourceAggregateVersion;
  const relationshipMuted = relationship.mute.viewerMutedTarget;
  const relationshipMuteChanged =
    stored.relationshipMutedPlayerIds.has(relationship.viewerPlayerId) !==
    relationshipMuted;
  if (relationshipMuted) {
    stored.relationshipMutedPlayerIds.add(relationship.viewerPlayerId);
  } else {
    stored.relationshipMutedPlayerIds.delete(relationship.viewerPlayerId);
  }
  if (sourceChanged || accessChanged || relationshipMuteChanged) {
    stored.membershipVersion = Math.max(
      stored.membershipVersion,
      friendshipSource.sourceAggregateVersion,
    );
    stored.snapshot = context.advanceConversation(stored, now);
  }
  if (sourceChanged) {
    const binding = ConversationSourceBindingV2Schema.parse({
      conversationId,
      source: friendshipSource,
      boundAt: now,
    });
    stored.sources.set(sourceKeyValue, binding);
    context.sourceToConversation.set(sourceKeyValue, conversationId);
    const sourceBoundEventId = context.eventId();
    eventIds.push(sourceBoundEventId);
    context.eventLog.push(
      ConversationSourceBoundEventV2Schema.parse({
        eventId: sourceBoundEventId,
        eventType: 'conversation.source_bound.v2',
        eventVersion: 2,
        aggregateType: 'conversation',
        aggregateId: conversationId,
        aggregateVersion: stored.snapshot.version,
        actorPlayerId: null,
        correlationId: projection.correlationId,
        causationId: projection.sourceEventId,
        occurredAt: now,
        payload: { binding },
      }),
    );
    if (action === 'none') action = 'bound_existing';
  }

  for (const transition of transitions) {
    const memberEventId = context.eventId();
    eventIds.push(memberEventId);
    const common = {
      eventId: memberEventId,
      eventVersion: 2 as const,
      aggregateType: 'conversation' as const,
      aggregateId: conversationId,
      aggregateVersion: stored.snapshot.version,
      actorPlayerId: null,
      correlationId: projection.correlationId,
      causationId: projection.sourceEventId,
      occurredAt: now,
      payload: {
        conversationId,
        member: transition.member,
        source: friendshipSource,
      },
    };
    context.eventLog.push(
      transition.kind === 'added'
        ? ConversationMemberAddedEventV2Schema.parse({
            ...common,
            eventType: 'conversation.member_added.v2',
          })
        : ConversationMemberRemovedEventV2Schema.parse({
            ...common,
            eventType: 'conversation.member_removed.v2',
          }),
    );
    if (transition.kind === 'removed') {
      const revokedEvent = context.accessRevokedEvent(
        stored,
        transition.member.playerId,
        reason,
        now,
        null,
        projection.correlationId,
        projection.sourceEventId,
      );
      eventIds.push(revokedEvent.eventId);
      context.eventLog.push(revokedEvent);
    }
  }

  if (accessChanged) {
    action = canViewConversation ? 'access_reconciled' : 'access_revoked';
  } else if (relationshipMuteChanged && action === 'none') {
    action = 'notification_policy_reconciled';
  }
  for (const playerId of [
    relationship.viewerPlayerId,
    relationship.targetPlayerId,
  ]) {
    context.notifyAccess(stored, playerId);
  }

  const receipt = RelationshipConversationProjectionReceiptV2Schema.parse({
    action,
    conversationId,
    relationshipId: relationship.relationshipId,
    relationshipVersion: relationship.version,
    sourceEventId: projection.sourceEventId,
    eventIds,
    repeated: false,
  });
  context.relationshipProjectionReceipts.set(replayKey, {
    fingerprint,
    receipt,
  });
  context.relationshipProjectionVersions.set(relationship.relationshipId, {
    version: relationship.version,
    fingerprint: relationshipFingerprint,
  });
  context.relationshipObservedVersions.set(
    relationship.relationshipId,
    Math.max(observedVersion, relationship.version),
  );
  return receipt;
}

export async function applyRelationshipEventProjection(
  context: RelationshipProjectionContext,
  input: RelationshipConversationAccessEventV2,
): Promise<RelationshipConversationProjectionReceiptV2> {
  const event = RelationshipConversationAccessEventV2Schema.parse(input);
  const fingerprint = stableJson(event);
  const replay = context.relationshipProjectionReceipts.get(event.eventId);
  if (replay) {
    if (replay.fingerprint !== fingerprint) {
      throw new ConversationV2ProviderError(
        'event_replay_conflict',
        'Relationship event ID is already bound to different access facts.',
        false,
      );
    }
    return { ...replay.receipt, repeated: true };
  }

  const pairIds =
    'requesterPlayerId' in event.payload
      ? [event.payload.requesterPlayerId, event.payload.recipientPlayerId]
      : 'blockerPlayerId' in event.payload
        ? [event.payload.blockerPlayerId, event.payload.blockedPlayerId]
        : [event.payload.muterPlayerId, event.payload.mutedPlayerId];
  let conversationId =
    context.directConversationByPair.get(directPairKey(pairIds)) ?? null;
  const observedVersion =
    context.relationshipObservedVersions.get(event.aggregateId) ?? 0;
  const eventIds: EventId[] = [];
  let action: RelationshipConversationProjectionReceiptV2['action'] = 'none';

  if (
    event.eventType === 'friendship.accepted.v2' &&
    event.aggregateVersion >= observedVersion
  ) {
    if (!('requesterPlayerId' in event.payload)) {
      throw new ConversationV2ProviderError(
        'validation_failed',
        'Friendship accepted event payload is invalid.',
        false,
      );
    }
    const friendshipPayload = event.payload;
    const existingConversationId = conversationId;
    const receipt = await context.provision(null, {
      commandName: 'provision_direct_conversation_v2',
      kind: 'direct',
      members: [
        { playerId: friendshipPayload.requesterPlayerId, role: 'member' },
        { playerId: friendshipPayload.recipientPlayerId, role: 'member' },
      ],
      membershipVersion: event.aggregateVersion,
      metadata: {
        idempotencyKey: IdempotencyKeySchema.parse(
          `friendship-conversation:${event.eventId}`,
        ),
        correlationId: event.correlationId,
        causationId: event.eventId,
        expectedAggregateVersion: 0,
        audit: {
          requestId: RequestIdSchema.parse(
            `relationship-event:${event.eventId}`,
          ),
          clientCreatedAt: event.occurredAt,
          clientPlatform: 'service',
        },
      },
      source: {
        sourceType: 'friendship',
        sourceId: event.aggregateId,
        sourceAggregateVersion: event.aggregateVersion,
      },
      title: null,
    });
    const acceptedConversationId = receipt.conversationId;
    conversationId = acceptedConversationId;
    eventIds.push(receipt.eventId);
    await context.projectSystemActivity({
      conversationId: acceptedConversationId,
      source: {
        sourceType: 'friendship',
        sourceId: event.aggregateId,
        sourceAggregateVersion: event.aggregateVersion,
      },
      sourceEventId: event.eventId,
      sourceEventType: event.eventType,
      sourceEventVersion: event.eventVersion,
      correlationId: event.correlationId,
      causationId: event.causationId,
      payload: friendshipPayload,
    });
    action = existingConversationId ? 'bound_existing' : 'provisioned';
  } else if (event.aggregateVersion >= observedVersion && conversationId) {
    const stored = context.requireConversation(conversationId);
    if (event.eventType === 'player.blocked.v2') {
      const transitions: ConversationMemberV2[] = [];
      for (const playerId of pairIds) {
        const existing = stored.members.get(playerId);
        if (!existing) continue;
        const changed =
          existing.state !== 'revoked' ||
          existing.canMessage ||
          existing.canViewConversation ||
          existing.revocationReason !== 'blocked' ||
          existing.membershipVersion < event.aggregateVersion;
        if (!changed) continue;
        const member: ConversationMemberV2 = {
          ...existing,
          canMessage: false,
          canViewConversation: false,
          membershipVersion: Math.max(
            existing.membershipVersion,
            event.aggregateVersion,
          ),
          state: 'revoked',
          revokedAt: event.occurredAt,
          revocationReason: 'blocked',
          version: existing.version + 1,
        };
        stored.members.set(playerId, member);
        transitions.push(member);
      }

      if (transitions.length) {
        stored.membershipVersion = Math.max(
          stored.membershipVersion,
          event.aggregateVersion,
        );
        stored.snapshot = context.advanceConversation(stored, event.occurredAt);
        for (const member of transitions) {
          const memberEventId = context.eventId();
          eventIds.push(memberEventId);
          context.eventLog.push(
            ConversationMemberRemovedEventV2Schema.parse({
              eventId: memberEventId,
              eventType: 'conversation.member_removed.v2',
              eventVersion: 2,
              aggregateType: 'conversation',
              aggregateId: conversationId,
              aggregateVersion: stored.snapshot.version,
              actorPlayerId: event.actorPlayerId,
              correlationId: event.correlationId,
              causationId: event.eventId,
              occurredAt: event.occurredAt,
              payload: {
                conversationId,
                member,
                source: stored.snapshot.source,
              },
            }),
          );
          const revoked = context.accessRevokedEvent(
            stored,
            member.playerId,
            'blocked',
            event.occurredAt,
            event.actorPlayerId,
            event.correlationId,
            event.eventId,
          );
          eventIds.push(revoked.eventId);
          context.eventLog.push(revoked);
          context.notifyAccess(stored, member.playerId);
        }
        action = 'access_revoked';
      }
    } else if ('muterPlayerId' in event.payload) {
      const muted = event.eventType === 'player.muted.v2';
      const muterPlayerId = event.payload.muterPlayerId;
      const current = stored.relationshipMutedPlayerIds.has(muterPlayerId);
      if (current !== muted) {
        if (muted) stored.relationshipMutedPlayerIds.add(muterPlayerId);
        else stored.relationshipMutedPlayerIds.delete(muterPlayerId);
        stored.snapshot = context.advanceConversation(stored, event.occurredAt);
        action = 'notification_policy_reconciled';
      }
    }
    // player.unblocked.v2 never grants access by itself. A complete
    // relationship snapshot at the same or a newer version must reconcile it.
  }

  context.relationshipObservedVersions.set(
    event.aggregateId,
    Math.max(observedVersion, event.aggregateVersion),
  );
  const receipt = RelationshipConversationProjectionReceiptV2Schema.parse({
    action,
    conversationId,
    relationshipId: event.aggregateId,
    relationshipVersion: event.aggregateVersion,
    sourceEventId: event.eventId,
    eventIds,
    repeated: false,
  });
  context.relationshipProjectionReceipts.set(event.eventId, {
    fingerprint,
    receipt,
  });
  return receipt;
}

function sourceKey(source: ConversationSourceV2) {
  return `${source.sourceType}:${source.sourceId}`;
}

function directPairKey(playerIds: readonly string[]) {
  if (playerIds.length !== 2 || playerIds[0] === playerIds[1]) {
    throw new ConversationV2ProviderError(
      'validation_failed',
      'Direct conversations require exactly two distinct players.',
      false,
    );
  }
  return [...playerIds].sort().join(':');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
