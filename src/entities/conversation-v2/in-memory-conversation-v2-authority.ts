import {
  AdvanceReadCursorCommandV2Schema,
  ConversationAccessRevokedEventV2Schema,
  ConversationAccessV2Schema,
  ConversationCommandReceiptV2Schema,
  ConversationMemberAddedEventV2Schema,
  ConversationMemberRemovedEventV2Schema,
  ConversationMembershipReconciledEventV2Schema,
  ConversationMutedEventV2Schema,
  ConversationProvisionedEventV2Schema,
  ConversationReadAdvancedEventV2Schema,
  ConversationReadCursorV2Schema,
  ConversationSnapshotV2Schema,
  ConversationTombstonedEventV2Schema,
  MessageReportEvidenceIdV2Schema,
  MessageSentEventV2Schema,
  MessageV2Schema,
  ProvisionDirectConversationCommandV2Schema,
  ProvisionSessionConversationCommandV2Schema,
  ReconcileConversationMembershipCommandV2Schema,
  SendMediaMessageCommandV2Schema,
  SendMessageCommandV2Schema,
  TombstoneConversationCommandV2Schema,
  ConversationMuteCommandV2Schema,
  type AdvanceReadCursorCommandV2,
  type AuthoritativeConversationMemberV2,
  type ConversationAccessReasonV2,
  type ConversationAccessV2,
  type ConversationCommandReceiptV2,
  type ConversationMuteCommandV2,
  type CoreV2CommandMetadata,
  type ConversationEventV2,
  type ConversationMemberV2,
  type ConversationReadCursorV2,
  type ConversationSnapshotV2,
  type ConversationSourceV2,
  type MessageV2,
  type ProvisionDirectConversationCommandV2,
  type ProvisionSessionConversationCommandV2,
  type ReconcileConversationMembershipCommandV2,
  type SendMediaMessageCommandV2,
  type SendMessageCommandV2,
  type TombstoneConversationCommandV2,
} from '@/shared/contracts/core-v2';
import {
  ConversationIdSchema,
  EventIdSchema,
  IdempotencyKeySchema,
  PlayerIdSchema,
  type EventId,
  type PlayerId,
} from '@/shared/contracts/core-v1';

import type {
  ConversationAccessProvider,
  ConversationEventLogV2,
  ConversationInboxItemV2,
  ConversationLifecycleProvider,
  ConversationMembershipProjection,
  ConversationModerationProvider,
  ConversationNotificationFactV2,
  ConversationNotificationProvider,
  ConversationProvisioningService,
  ConversationRepository,
  ConversationSystemActivityV2,
  MessageTransport,
  VerifiedConversationActorV2,
} from './conversation-v2-provider';
import { ConversationV2ProviderError } from './conversation-v2-error';

type StoredConversation = {
  snapshot: ConversationSnapshotV2;
  members: Map<string, ConversationMemberV2>;
  messages: MessageV2[];
  cursors: Map<string, ConversationReadCursorV2>;
  mutedPlayerIds: Set<string>;
};

type StoredReceipt = {
  fingerprint: string;
  receipt: ConversationCommandReceiptV2;
};

type StoredEvidence = Readonly<{
  evidenceId: ReturnType<typeof MessageReportEvidenceIdV2Schema.parse>;
  conversationId: string;
  message: MessageV2;
  reporterPlayerId: PlayerId;
  capturedAt: string;
  reportId: string;
}>;

type AuthorityOptions = Readonly<{
  clock?: () => Date;
  createUuid?: () => string;
  notificationProvider?: ConversationNotificationProvider;
}>;

type ConversationV2Authority = ConversationRepository &
  ConversationProvisioningService &
  ConversationMembershipProjection &
  MessageTransport &
  ConversationAccessProvider &
  ConversationModerationProvider &
  ConversationLifecycleProvider &
  ConversationEventLogV2;

export class InMemoryConversationV2Authority implements ConversationV2Authority {
  private readonly clock: () => Date;
  private readonly createUuid: () => string;
  private readonly notificationProvider?: ConversationNotificationProvider;
  private readonly conversations = new Map<string, StoredConversation>();
  private readonly sourceToConversation = new Map<string, string>();
  private readonly commandReceipts = new Map<string, StoredReceipt>();
  private readonly clientMessageReceipts = new Map<string, StoredReceipt>();
  private readonly systemMessagesByEvent = new Map<string, MessageV2>();
  private readonly readReceipts = new Map<
    string,
    ConversationCommandReceiptV2
  >();
  private readonly reportEvidence = new Map<string, StoredEvidence>();
  private readonly accessListeners = new Map<
    string,
    Set<(access: ConversationAccessV2) => void>
  >();
  private readonly eventLog: ConversationEventV2[] = [];

  constructor(options: AuthorityOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.createUuid = options.createUuid ?? createUuid;
    this.notificationProvider = options.notificationProvider;
  }

  events() {
    return [...this.eventLog];
  }

  async provisionDirect(
    actor: VerifiedConversationActorV2 | null,
    input: ProvisionDirectConversationCommandV2,
  ) {
    const command = ProvisionDirectConversationCommandV2Schema.parse(input);
    const members: AuthoritativeConversationMemberV2[] =
      command.participantPlayerIds.map((playerId) => ({
        playerId,
        role: 'member',
      }));
    return this.provision(actor, {
      commandName: 'provision_direct_conversation_v2',
      kind: 'direct',
      members,
      metadata: command.metadata,
      source: command.source,
      title: null,
    });
  }

  async provisionSession(
    actor: VerifiedConversationActorV2 | null,
    input: ProvisionSessionConversationCommandV2,
  ) {
    const command = ProvisionSessionConversationCommandV2Schema.parse(input);
    return this.provision(actor, {
      commandName: 'provision_session_conversation_v2',
      kind: 'group',
      members: command.members,
      metadata: command.metadata,
      source: command.source,
      title: command.title,
    });
  }

  async getConversation(
    actor: VerifiedConversationActorV2,
    conversationIdInput: string,
  ) {
    const conversationId = ConversationIdSchema.parse(conversationIdInput);
    const stored = this.conversations.get(conversationId);
    if (!stored) return null;
    this.requireReadAccess(actor, stored);
    return clone(stored.snapshot);
  }

  async getTimeline(
    actor: VerifiedConversationActorV2,
    conversationIdInput: string,
  ) {
    const stored = this.requireConversation(conversationIdInput);
    this.requireReadAccess(actor, stored);
    return stored.messages.map(clone);
  }

  async listInbox(actor: VerifiedConversationActorV2) {
    const items: ConversationInboxItemV2[] = [];
    for (const stored of this.conversations.values()) {
      const access = this.accessFor(actor, stored);
      if (!access.canRead) continue;
      const cursor = this.cursorFor(stored, actor.playerId);
      items.push({
        conversation: clone(stored.snapshot),
        members: [...stored.members.values()].map(clone),
        muted: stored.mutedPlayerIds.has(actor.playerId),
        readCursor: clone(cursor),
        unreadCount: Math.max(
          0,
          stored.snapshot.lastSequence - cursor.lastReadSequence,
        ),
      });
    }
    return items.sort((left, right) =>
      right.conversation.updatedAt.localeCompare(left.conversation.updatedAt),
    );
  }

  async sendText(
    actor: VerifiedConversationActorV2,
    input: SendMessageCommandV2,
  ) {
    const command = SendMessageCommandV2Schema.parse(input);
    return this.send(actor, command, {
      kind: 'text',
      text: command.text,
    });
  }

  async sendMedia(
    actor: VerifiedConversationActorV2,
    input: SendMediaMessageCommandV2,
  ) {
    const command = SendMediaMessageCommandV2Schema.parse(input);
    return this.send(actor, command, {
      kind: 'media',
      assetId: command.assetId,
      ...(command.caption ? { caption: command.caption } : {}),
    });
  }

  async advanceReadCursor(
    actor: VerifiedConversationActorV2,
    input: AdvanceReadCursorCommandV2,
  ) {
    const command = AdvanceReadCursorCommandV2Schema.parse(input);
    const fingerprint = stableJson({ actorPlayerId: actor.playerId, command });
    const replay = this.replay(command.metadata.idempotencyKey, fingerprint);
    if (replay) return replay;

    const stored = this.requireConversation(command.conversationId);
    this.requireReadAccess(actor, stored);
    const current = this.cursorFor(stored, actor.playerId);
    const semanticKey = `${stored.snapshot.conversationId}:${actor.playerId}:${command.lastReadSequence}`;
    const semanticReplay = this.readReceipts.get(semanticKey);
    if (semanticReplay) {
      const receipt = { ...semanticReplay, repeated: true };
      this.storeReceipt(command.metadata.idempotencyKey, fingerprint, receipt);
      return receipt;
    }
    if (command.lastReadSequence < current.lastReadSequence) {
      throw new ConversationV2ProviderError(
        'read_cursor_regression',
        'Read cursor cannot move backwards.',
        false,
        {
          current: current.lastReadSequence,
          requested: command.lastReadSequence,
        },
      );
    }
    if (command.lastReadSequence > stored.snapshot.lastSequence) {
      throw new ConversationV2ProviderError(
        'read_cursor_ahead',
        'Read cursor cannot advance beyond the conversation sequence.',
        false,
        { lastSequence: stored.snapshot.lastSequence },
      );
    }
    this.requireVersion(stored, command.metadata.expectedAggregateVersion);

    const now = this.now();
    stored.snapshot = this.advanceConversation(stored, now);
    const cursor = ConversationReadCursorV2Schema.parse({
      ...current,
      lastReadSequence: command.lastReadSequence,
      updatedAt: now,
      version: current.version + 1,
    });
    stored.cursors.set(actor.playerId, cursor);
    const eventId = this.eventId();
    const event = ConversationReadAdvancedEventV2Schema.parse({
      eventId,
      eventType: 'conversation.read_advanced.v2',
      eventVersion: 2,
      aggregateType: 'conversation',
      aggregateId: stored.snapshot.conversationId,
      aggregateVersion: stored.snapshot.version,
      actorPlayerId: actor.playerId,
      correlationId: command.metadata.correlationId,
      causationId: command.metadata.causationId,
      occurredAt: now,
      payload: { readCursor: cursor },
    });
    this.eventLog.push(event);
    const receipt = this.receipt({
      actorPlayerId: actor.playerId,
      commandName: 'advance_read_cursor_v2',
      eventId,
      metadata: command.metadata,
      snapshot: stored.snapshot,
      readCursor: cursor,
    });
    this.readReceipts.set(semanticKey, receipt);
    this.storeReceipt(command.metadata.idempotencyKey, fingerprint, receipt);
    return receipt;
  }

  async reconcile(
    actor: VerifiedConversationActorV2 | null,
    input: ReconcileConversationMembershipCommandV2,
  ) {
    const command = ReconcileConversationMembershipCommandV2Schema.parse(input);
    const fingerprint = stableJson({
      actorPlayerId: actor?.playerId ?? null,
      command,
    });
    const replay = this.replay(command.metadata.idempotencyKey, fingerprint);
    if (replay) return replay;
    const stored = this.requireConversation(command.conversationId);
    if (sourceKey(stored.snapshot.source) !== sourceKey(command.source)) {
      throw new ConversationV2ProviderError(
        'conversation_source_conflict',
        'Membership source does not match the conversation source.',
        false,
      );
    }
    if (command.source.sourceVersion < stored.snapshot.source.sourceVersion) {
      throw new ConversationV2ProviderError(
        'source_version_conflict',
        'Membership source version is stale.',
        true,
        {
          current: stored.snapshot.source.sourceVersion,
          requested: command.source.sourceVersion,
        },
      );
    }
    const requestedMembers = normalizedMembers(command.members);
    const currentMembers = normalizedActiveMembers(stored.members);
    if (
      command.source.sourceVersion === stored.snapshot.source.sourceVersion &&
      stableJson(requestedMembers) === stableJson(currentMembers)
    ) {
      const eventId = this.eventId();
      const receipt = this.receipt({
        actorPlayerId: actor?.playerId ?? null,
        commandName: 'reconcile_conversation_membership_v2',
        eventId,
        metadata: command.metadata,
        repeated: true,
        snapshot: stored.snapshot,
      });
      this.storeReceipt(command.metadata.idempotencyKey, fingerprint, receipt);
      return receipt;
    }
    this.requireVersion(stored, command.metadata.expectedAggregateVersion);

    const now = this.now();
    const requestedByPlayer = new Map(
      command.members.map((member) => [member.playerId, member]),
    );
    const memberEvents: ConversationEventV2[] = [];
    for (const existing of stored.members.values()) {
      const requested = requestedByPlayer.get(existing.playerId);
      if (requested) {
        const reactivated = existing.state === 'revoked';
        const roleChanged = existing.role !== requested.role;
        stored.members.set(existing.playerId, {
          ...existing,
          role: requested.role,
          sourceVersion: command.source.sourceVersion,
          state: 'active',
          revokedAt: null,
          revocationReason: null,
          version: existing.version + (reactivated || roleChanged ? 1 : 0),
        });
        requestedByPlayer.delete(existing.playerId);
        if (reactivated) {
          memberEvents.push(
            this.memberEvent(
              'added',
              stored,
              existing.playerId,
              now,
              actor?.playerId ?? null,
              command,
            ),
          );
        }
      } else if (existing.state === 'active') {
        stored.members.set(existing.playerId, {
          ...existing,
          state: 'revoked',
          sourceVersion: command.source.sourceVersion,
          revokedAt: now,
          revocationReason: command.revocationReason,
          version: existing.version + 1,
        });
        memberEvents.push(
          this.memberEvent(
            'removed',
            stored,
            existing.playerId,
            now,
            actor?.playerId ?? null,
            command,
          ),
          this.accessRevokedEvent(
            stored,
            existing.playerId,
            command.revocationReason,
            now,
            actor?.playerId ?? null,
            command.metadata.correlationId,
            command.metadata.causationId,
          ),
        );
      }
    }
    for (const member of requestedByPlayer.values()) {
      stored.members.set(
        member.playerId,
        this.newMember(member, command.source.sourceVersion, now),
      );
      memberEvents.push(
        this.memberEvent(
          'added',
          stored,
          member.playerId,
          now,
          actor?.playerId ?? null,
          command,
        ),
      );
    }

    stored.snapshot = ConversationSnapshotV2Schema.parse({
      ...this.advanceConversation(stored, now),
      source: command.source,
    });
    const eventId = this.eventId();
    this.eventLog.push(
      ConversationMembershipReconciledEventV2Schema.parse({
        eventId,
        eventType: 'conversation.membership_reconciled.v2',
        eventVersion: 2,
        aggregateType: 'conversation',
        aggregateId: stored.snapshot.conversationId,
        aggregateVersion: stored.snapshot.version,
        actorPlayerId: actor?.playerId ?? null,
        correlationId: command.metadata.correlationId,
        causationId: command.metadata.causationId,
        occurredAt: now,
        payload: {
          conversationId: stored.snapshot.conversationId,
          source: command.source,
          activeMemberPlayerIds: normalizedActiveMembers(stored.members).map(
            (member) => member.playerId,
          ),
        },
      }),
      ...memberEvents.map(
        (event) =>
          ({
            ...event,
            aggregateVersion: stored.snapshot.version,
          }) as ConversationEventV2,
      ),
    );
    for (const member of stored.members.values()) {
      this.notifyAccess(stored, member.playerId);
    }
    const receipt = this.receipt({
      actorPlayerId: actor?.playerId ?? null,
      commandName: 'reconcile_conversation_membership_v2',
      eventId,
      metadata: command.metadata,
      snapshot: stored.snapshot,
    });
    this.storeReceipt(command.metadata.idempotencyKey, fingerprint, receipt);
    return receipt;
  }

  async projectSystemActivity(activity: ConversationSystemActivityV2) {
    if (activity.sourceEventVersion !== 2) {
      throw new ConversationV2ProviderError(
        'unsupported_event_version',
        `Unsupported system event version ${activity.sourceEventVersion}.`,
        false,
      );
    }
    const eventId = EventIdSchema.parse(activity.sourceEventId);
    const existing = this.systemMessagesByEvent.get(eventId);
    if (existing) return clone(existing);
    const stored = this.requireConversation(activity.conversationId);
    if (sourceKey(stored.snapshot.source) !== sourceKey(activity.source)) {
      throw new ConversationV2ProviderError(
        'conversation_source_conflict',
        'System activity source does not match the conversation source.',
        false,
      );
    }
    const now = this.now();
    stored.snapshot = this.advanceConversation(stored, now, true);
    const message = MessageV2Schema.parse({
      messageId: this.createUuid(),
      conversationId: stored.snapshot.conversationId,
      senderPlayerId: null,
      clientMessageId: `system-event:${eventId}`,
      sequence: stored.snapshot.lastSequence,
      content: {
        kind: 'system',
        sourceEventId: eventId,
        sourceEventType: activity.sourceEventType,
        sourceEventVersion: activity.sourceEventVersion,
        payload: activity.payload,
      },
      createdAt: now,
      tombstonedAt: null,
    });
    stored.messages.push(message);
    this.systemMessagesByEvent.set(eventId, message);
    this.eventLog.push(
      MessageSentEventV2Schema.parse({
        eventId: this.eventId(),
        eventType: 'message.sent.v2',
        eventVersion: 2,
        aggregateType: 'conversation',
        aggregateId: stored.snapshot.conversationId,
        aggregateVersion: stored.snapshot.version,
        actorPlayerId: null,
        correlationId: activity.correlationId,
        causationId: activity.causationId,
        occurredAt: now,
        payload: {
          message,
          recipientPlayerIds: this.activePlayerIds(stored),
        },
      }),
    );
    return clone(message);
  }

  async getAccess(
    actor: VerifiedConversationActorV2,
    conversationIdInput: string,
  ) {
    return clone(
      this.accessFor(actor, this.requireConversation(conversationIdInput)),
    );
  }

  subscribeAccess(
    actor: VerifiedConversationActorV2,
    conversationIdInput: string,
    listener: (access: ConversationAccessV2) => void,
  ) {
    const stored = this.requireConversation(conversationIdInput);
    const access = this.accessFor(actor, stored);
    if (!access.canSubscribe) {
      throw new ConversationV2ProviderError(
        'conversation_access_revoked',
        'Conversation subscription access is revoked.',
        false,
      );
    }
    const key = listenerKey(stored.snapshot.conversationId, actor.playerId);
    const listeners = this.accessListeners.get(key) ?? new Set();
    listeners.add(listener);
    this.accessListeners.set(key, listeners);
    return {
      remove: () => {
        listeners.delete(listener);
        if (listeners.size === 0) this.accessListeners.delete(key);
      },
    };
  }

  async mute(
    actor: VerifiedConversationActorV2,
    input: ConversationMuteCommandV2,
  ) {
    return this.setMuted(
      actor,
      ConversationMuteCommandV2Schema.parse(input),
      true,
    );
  }

  async unmute(
    actor: VerifiedConversationActorV2,
    input: ConversationMuteCommandV2,
  ) {
    return this.setMuted(
      actor,
      ConversationMuteCommandV2Schema.parse(input),
      false,
    );
  }

  async tombstone(
    actor: VerifiedConversationActorV2 | null,
    input: TombstoneConversationCommandV2,
  ) {
    const command = TombstoneConversationCommandV2Schema.parse(input);
    const fingerprint = stableJson({
      actorPlayerId: actor?.playerId ?? null,
      command,
    });
    const replay = this.replay(command.metadata.idempotencyKey, fingerprint);
    if (replay) return replay;
    const stored = this.requireConversation(command.conversationId);
    if (stored.snapshot.state === 'tombstoned') {
      const receipt = this.receipt({
        actorPlayerId: actor?.playerId ?? null,
        commandName: 'tombstone_conversation_v2',
        eventId: this.eventId(),
        metadata: command.metadata,
        repeated: true,
        snapshot: stored.snapshot,
      });
      this.storeReceipt(command.metadata.idempotencyKey, fingerprint, receipt);
      return receipt;
    }
    this.requireVersion(stored, command.metadata.expectedAggregateVersion);
    const now = this.now();
    stored.snapshot = ConversationSnapshotV2Schema.parse({
      ...this.advanceConversation(stored, now),
      state: 'tombstoned',
      tombstonedAt: now,
    });
    const eventId = this.eventId();
    this.eventLog.push(
      ConversationTombstonedEventV2Schema.parse({
        eventId,
        eventType: 'conversation.tombstoned.v2',
        eventVersion: 2,
        aggregateType: 'conversation',
        aggregateId: stored.snapshot.conversationId,
        aggregateVersion: stored.snapshot.version,
        actorPlayerId: actor?.playerId ?? null,
        correlationId: command.metadata.correlationId,
        causationId: command.metadata.causationId,
        occurredAt: now,
        payload: {
          conversationId: stored.snapshot.conversationId,
          reason: command.reason,
          tombstonedAt: now,
        },
      }),
    );
    for (const member of stored.members.values()) {
      this.notifyAccess(stored, member.playerId);
    }
    const receipt = this.receipt({
      actorPlayerId: actor?.playerId ?? null,
      commandName: 'tombstone_conversation_v2',
      eventId,
      metadata: command.metadata,
      snapshot: stored.snapshot,
    });
    this.storeReceipt(command.metadata.idempotencyKey, fingerprint, receipt);
    return receipt;
  }

  async captureReportEvidence(input: {
    actor: VerifiedConversationActorV2;
    conversationId: string;
    messageId: string;
    reportId: string;
  }) {
    const stored = this.requireConversation(input.conversationId);
    this.requireReadAccess(input.actor, stored);
    const key = input.reportId.trim();
    if (!key) {
      throw new ConversationV2ProviderError(
        'validation_failed',
        'Report ID is required.',
        false,
      );
    }
    const existing = this.reportEvidence.get(key);
    if (existing) {
      if (
        existing.message.messageId !== input.messageId ||
        existing.reporterPlayerId !== input.actor.playerId
      ) {
        throw new ConversationV2ProviderError(
          'message_idempotency_conflict',
          'Report evidence identity is already bound to different facts.',
          false,
        );
      }
      return clone(existing);
    }
    const message = stored.messages.find(
      (item) => item.messageId === input.messageId,
    );
    if (!message) {
      throw new ConversationV2ProviderError(
        'message_not_found',
        'Message was not found.',
        false,
      );
    }
    const evidence: StoredEvidence = Object.freeze({
      evidenceId: MessageReportEvidenceIdV2Schema.parse(this.createUuid()),
      conversationId: stored.snapshot.conversationId,
      message: Object.freeze(clone(message)),
      reporterPlayerId: input.actor.playerId,
      capturedAt: this.now(),
      reportId: key,
    });
    this.reportEvidence.set(key, evidence);
    return clone(evidence);
  }

  private async provision(
    actor: VerifiedConversationActorV2 | null,
    input: {
      commandName:
        | 'provision_direct_conversation_v2'
        | 'provision_session_conversation_v2';
      kind: 'direct' | 'group';
      members: readonly AuthoritativeConversationMemberV2[];
      metadata: CoreV2CommandMetadata;
      source: ConversationSourceV2;
      title: string | null;
    },
  ) {
    const fingerprint = stableJson({
      actorPlayerId: actor?.playerId ?? null,
      ...input,
    });
    const replay = this.replay(input.metadata.idempotencyKey, fingerprint);
    if (replay) return replay;
    const key = sourceKey(input.source);
    const existingId = this.sourceToConversation.get(key);
    if (existingId) {
      const existing = this.requireConversation(existingId);
      const same =
        existing.snapshot.kind === input.kind &&
        existing.snapshot.title === input.title &&
        stableJson(normalizedActiveMembers(existing.members)) ===
          stableJson(normalizedMembers(input.members));
      if (!same) {
        throw new ConversationV2ProviderError(
          'conversation_source_conflict',
          'Conversation source is already mapped to different semantics.',
          false,
        );
      }
      const receipt = this.receipt({
        actorPlayerId: actor?.playerId ?? null,
        commandName: input.commandName,
        eventId: this.eventId(),
        metadata: input.metadata,
        repeated: true,
        snapshot: existing.snapshot,
      });
      this.storeReceipt(input.metadata.idempotencyKey, fingerprint, receipt);
      return receipt;
    }

    const now = this.now();
    const conversationId = ConversationIdSchema.parse(this.createUuid());
    const snapshot = ConversationSnapshotV2Schema.parse({
      conversationId,
      kind: input.kind,
      source: input.source,
      state: 'open',
      title: input.title,
      version: 1,
      lastSequence: 0,
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
    });
    const members = new Map<string, ConversationMemberV2>();
    for (const member of input.members) {
      members.set(
        member.playerId,
        this.newMember(member, input.source.sourceVersion, now),
      );
    }
    const stored: StoredConversation = {
      snapshot,
      members,
      messages: [],
      cursors: new Map(),
      mutedPlayerIds: new Set(),
    };
    this.conversations.set(conversationId, stored);
    this.sourceToConversation.set(key, conversationId);
    const eventId = this.eventId();
    this.eventLog.push(
      ConversationProvisionedEventV2Schema.parse({
        eventId,
        eventType: 'conversation.provisioned.v2',
        eventVersion: 2,
        aggregateType: 'conversation',
        aggregateId: conversationId,
        aggregateVersion: 1,
        actorPlayerId: actor?.playerId ?? null,
        correlationId: input.metadata.correlationId,
        causationId: input.metadata.causationId,
        occurredAt: now,
        payload: { conversation: snapshot },
      }),
    );
    const receipt = this.receipt({
      actorPlayerId: actor?.playerId ?? null,
      commandName: input.commandName,
      eventId,
      metadata: input.metadata,
      snapshot,
    });
    this.storeReceipt(input.metadata.idempotencyKey, fingerprint, receipt);
    return receipt;
  }

  private async send(
    actor: VerifiedConversationActorV2,
    command:
      | ReturnType<typeof SendMessageCommandV2Schema.parse>
      | ReturnType<typeof SendMediaMessageCommandV2Schema.parse>,
    content: MessageV2['content'],
  ) {
    const fingerprint = stableJson({
      actorPlayerId: actor.playerId,
      command,
      content,
    });
    const replay = this.replay(command.metadata.idempotencyKey, fingerprint);
    if (replay) return replay;
    const semanticKey = `${command.conversationId}:${actor.playerId}:${command.clientMessageId}`;
    const semanticReplay = this.clientMessageReceipts.get(semanticKey);
    if (semanticReplay) {
      if (
        semanticReplay.fingerprint !==
        stableJson({
          actorPlayerId: actor.playerId,
          conversationId: command.conversationId,
          clientMessageId: command.clientMessageId,
          content,
        })
      ) {
        throw new ConversationV2ProviderError(
          'message_idempotency_conflict',
          'Client message ID is already bound to different content.',
          false,
        );
      }
      const receipt = { ...semanticReplay.receipt, repeated: true };
      this.storeReceipt(command.metadata.idempotencyKey, fingerprint, receipt);
      return receipt;
    }
    const stored = this.requireConversation(command.conversationId);
    this.requireSendAccess(actor, stored);
    this.requireVersion(stored, command.metadata.expectedAggregateVersion);
    const now = this.now();
    stored.snapshot = this.advanceConversation(stored, now, true);
    const message = MessageV2Schema.parse({
      messageId: this.createUuid(),
      conversationId: stored.snapshot.conversationId,
      senderPlayerId: actor.playerId,
      clientMessageId: command.clientMessageId,
      sequence: stored.snapshot.lastSequence,
      content,
      createdAt: now,
      tombstonedAt: null,
    });
    stored.messages.push(message);
    const eventId = this.eventId();
    const recipients = this.activePlayerIds(stored).filter(
      (playerId) => playerId !== actor.playerId,
    );
    this.eventLog.push(
      MessageSentEventV2Schema.parse({
        eventId,
        eventType: 'message.sent.v2',
        eventVersion: 2,
        aggregateType: 'conversation',
        aggregateId: stored.snapshot.conversationId,
        aggregateVersion: stored.snapshot.version,
        actorPlayerId: actor.playerId,
        correlationId: command.metadata.correlationId,
        causationId: command.metadata.causationId,
        occurredAt: now,
        payload: { message, recipientPlayerIds: recipients },
      }),
    );
    const receipt = this.receipt({
      actorPlayerId: actor.playerId,
      commandName:
        content.kind === 'media' ? 'send_media_message_v2' : 'send_message_v2',
      eventId,
      message,
      metadata: command.metadata,
      snapshot: stored.snapshot,
    });
    this.storeReceipt(command.metadata.idempotencyKey, fingerprint, receipt);
    this.clientMessageReceipts.set(semanticKey, {
      fingerprint: stableJson({
        actorPlayerId: actor.playerId,
        conversationId: command.conversationId,
        clientMessageId: command.clientMessageId,
        content,
      }),
      receipt,
    });
    await Promise.all(
      recipients.map((recipientPlayerId) =>
        this.notificationProvider?.publish({
          conversationId: stored.snapshot.conversationId,
          messageId: message.messageId,
          recipientPlayerId,
          senderPlayerId: actor.playerId,
          correlationId: command.metadata.correlationId,
          source: stored.snapshot.source,
        } satisfies ConversationNotificationFactV2),
      ),
    );
    return receipt;
  }

  private async setMuted(
    actor: VerifiedConversationActorV2,
    command: ReturnType<typeof ConversationMuteCommandV2Schema.parse>,
    muted: boolean,
  ) {
    const fingerprint = stableJson({
      actorPlayerId: actor.playerId,
      command,
      muted,
    });
    const replay = this.replay(command.metadata.idempotencyKey, fingerprint);
    if (replay) return replay;
    const stored = this.requireConversation(command.conversationId);
    this.requireReadAccess(actor, stored);
    const current = stored.mutedPlayerIds.has(actor.playerId);
    if (current === muted) {
      const receipt = this.receipt({
        actorPlayerId: actor.playerId,
        commandName: muted ? 'mute_conversation_v2' : 'unmute_conversation_v2',
        eventId: this.eventId(),
        metadata: command.metadata,
        repeated: true,
        snapshot: stored.snapshot,
      });
      this.storeReceipt(command.metadata.idempotencyKey, fingerprint, receipt);
      return receipt;
    }
    this.requireVersion(stored, command.metadata.expectedAggregateVersion);
    const now = this.now();
    if (muted) stored.mutedPlayerIds.add(actor.playerId);
    else stored.mutedPlayerIds.delete(actor.playerId);
    stored.snapshot = this.advanceConversation(stored, now);
    const eventId = this.eventId();
    this.eventLog.push(
      ConversationMutedEventV2Schema.parse({
        eventId,
        eventType: 'conversation.muted.v2',
        eventVersion: 2,
        aggregateType: 'conversation',
        aggregateId: stored.snapshot.conversationId,
        aggregateVersion: stored.snapshot.version,
        actorPlayerId: actor.playerId,
        correlationId: command.metadata.correlationId,
        causationId: command.metadata.causationId,
        occurredAt: now,
        payload: {
          conversationId: stored.snapshot.conversationId,
          playerId: actor.playerId,
          muted,
        },
      }),
    );
    const receipt = this.receipt({
      actorPlayerId: actor.playerId,
      commandName: muted ? 'mute_conversation_v2' : 'unmute_conversation_v2',
      eventId,
      metadata: command.metadata,
      snapshot: stored.snapshot,
    });
    this.storeReceipt(command.metadata.idempotencyKey, fingerprint, receipt);
    return receipt;
  }

  private memberEvent(
    kind: 'added' | 'removed',
    stored: StoredConversation,
    playerId: string,
    occurredAt: string,
    actorPlayerId: PlayerId | null,
    command: ReturnType<
      typeof ReconcileConversationMembershipCommandV2Schema.parse
    >,
  ) {
    const member = stored.members.get(playerId)!;
    const common = {
      eventId: this.eventId(),
      eventVersion: 2 as const,
      aggregateType: 'conversation' as const,
      aggregateId: stored.snapshot.conversationId,
      aggregateVersion: stored.snapshot.version,
      actorPlayerId,
      correlationId: command.metadata.correlationId,
      causationId: command.metadata.causationId,
      occurredAt,
      payload: {
        conversationId: stored.snapshot.conversationId,
        member,
        source: command.source,
      },
    };
    return kind === 'added'
      ? ConversationMemberAddedEventV2Schema.parse({
          ...common,
          eventType: 'conversation.member_added.v2',
        })
      : ConversationMemberRemovedEventV2Schema.parse({
          ...common,
          eventType: 'conversation.member_removed.v2',
        });
  }

  private newMember(
    member: AuthoritativeConversationMemberV2,
    sourceVersion: number,
    now: string,
  ): ConversationMemberV2 {
    return {
      playerId: member.playerId,
      role: member.role,
      state: 'active',
      sourceVersion,
      version: 1,
      joinedAt: now,
      revokedAt: null,
      revocationReason: null,
    };
  }

  private activePlayerIds(stored: StoredConversation) {
    return [...stored.members.values()]
      .filter((member) => member.state === 'active')
      .map((member) => member.playerId);
  }

  private cursorFor(stored: StoredConversation, playerId: PlayerId) {
    const existing = stored.cursors.get(playerId);
    if (existing) return existing;
    const cursor = ConversationReadCursorV2Schema.parse({
      conversationId: stored.snapshot.conversationId,
      playerId,
      lastReadSequence: 0,
      version: 1,
      updatedAt: stored.snapshot.createdAt,
    });
    stored.cursors.set(playerId, cursor);
    return cursor;
  }

  private requireConversation(conversationIdInput: string) {
    const conversationId = ConversationIdSchema.parse(conversationIdInput);
    const stored = this.conversations.get(conversationId);
    if (!stored) {
      throw new ConversationV2ProviderError(
        'conversation_not_found',
        'Conversation was not found.',
        false,
      );
    }
    return stored;
  }

  private accessFor(
    actor: VerifiedConversationActorV2,
    stored: StoredConversation,
  ): ConversationAccessV2 {
    const member = stored.members.get(actor.playerId);
    let reason: ConversationAccessReasonV2 = 'active_member';
    if (!member) reason = 'not_a_member';
    else if (member.state === 'revoked') {
      reason = member.revocationReason ?? 'source_membership_revoked';
    } else if (stored.snapshot.state === 'tombstoned') {
      reason = 'conversation_tombstoned';
    }
    const activeMember = member?.state === 'active';
    return ConversationAccessV2Schema.parse({
      conversationId: stored.snapshot.conversationId,
      playerId: actor.playerId,
      canRead: Boolean(activeMember),
      canSend: Boolean(activeMember && stored.snapshot.state === 'open'),
      canSubscribe: Boolean(activeMember),
      reason,
      conversationVersion: stored.snapshot.version,
      sourceVersion: stored.snapshot.source.sourceVersion,
    });
  }

  private requireReadAccess(
    actor: VerifiedConversationActorV2,
    stored: StoredConversation,
  ) {
    const access = this.accessFor(actor, stored);
    if (!access.canRead) {
      throw new ConversationV2ProviderError(
        'conversation_access_revoked',
        'Conversation read access is revoked.',
        false,
        { reason: access.reason },
      );
    }
  }

  private requireSendAccess(
    actor: VerifiedConversationActorV2,
    stored: StoredConversation,
  ) {
    const access = this.accessFor(actor, stored);
    if (!access.canSend) {
      throw new ConversationV2ProviderError(
        stored.snapshot.state === 'tombstoned'
          ? 'conversation_tombstoned'
          : 'conversation_access_revoked',
        'Conversation send access is revoked.',
        false,
        { reason: access.reason },
      );
    }
  }

  private requireVersion(stored: StoredConversation, expected: number) {
    if (stored.snapshot.version !== expected) {
      throw new ConversationV2ProviderError(
        'conversation_version_conflict',
        'Conversation aggregate version is stale.',
        true,
        { current: stored.snapshot.version, expected },
      );
    }
  }

  private advanceConversation(
    stored: StoredConversation,
    now: string,
    advanceSequence = false,
  ) {
    return ConversationSnapshotV2Schema.parse({
      ...stored.snapshot,
      version: stored.snapshot.version + 1,
      lastSequence: stored.snapshot.lastSequence + (advanceSequence ? 1 : 0),
      updatedAt: now,
    });
  }

  private receipt(input: {
    actorPlayerId: PlayerId | null;
    commandName: ConversationCommandReceiptV2['commandName'];
    eventId: EventId;
    message?: MessageV2;
    metadata: {
      correlationId: string;
      idempotencyKey: string;
    };
    readCursor?: ConversationReadCursorV2;
    repeated?: boolean;
    snapshot: ConversationSnapshotV2;
  }) {
    return ConversationCommandReceiptV2Schema.parse({
      commandName: input.commandName,
      conversationId: input.snapshot.conversationId,
      actorPlayerId: input.actorPlayerId,
      aggregateVersion: input.snapshot.version,
      idempotencyKey: input.metadata.idempotencyKey,
      correlationId: input.metadata.correlationId,
      eventId: input.eventId,
      acceptedAt: this.now(),
      repeated: input.repeated ?? false,
      ...(input.message ? { message: input.message } : {}),
      ...(input.readCursor ? { readCursor: input.readCursor } : {}),
    });
  }

  private replay(idempotencyKeyInput: string, fingerprint: string) {
    const idempotencyKey = IdempotencyKeySchema.parse(idempotencyKeyInput);
    const existing = this.commandReceipts.get(idempotencyKey);
    if (!existing) return null;
    if (existing.fingerprint !== fingerprint) {
      throw new ConversationV2ProviderError(
        'message_idempotency_conflict',
        'Idempotency key is already bound to a different command.',
        false,
      );
    }
    return { ...existing.receipt, repeated: true };
  }

  private storeReceipt(
    idempotencyKeyInput: string,
    fingerprint: string,
    receipt: ConversationCommandReceiptV2,
  ) {
    this.commandReceipts.set(IdempotencyKeySchema.parse(idempotencyKeyInput), {
      fingerprint,
      receipt,
    });
  }

  private notifyAccess(stored: StoredConversation, playerIdInput: string) {
    const playerId = PlayerIdSchema.parse(playerIdInput);
    const key = listenerKey(stored.snapshot.conversationId, playerId);
    const listeners = this.accessListeners.get(key);
    if (!listeners?.size) return;
    const member = stored.members.get(playerId);
    const actor: VerifiedConversationActorV2 = {
      accountId:
        '00000000-0000-4000-8000-000000000000' as VerifiedConversationActorV2['accountId'],
      playerId,
      lifecycleVersion: 1,
      messagingAllowed: true,
    };
    const access = this.accessFor(actor, stored);
    for (const listener of listeners) listener(clone(access));
    if (!member || member.state === 'revoked') {
      this.accessListeners.delete(key);
    }
  }

  private accessRevokedEvent(
    stored: StoredConversation,
    playerIdInput: string,
    reason: ConversationAccessReasonV2,
    occurredAt: string,
    actorPlayerId: PlayerId | null,
    correlationId: string,
    causationId: EventId | null,
  ) {
    const playerId = PlayerIdSchema.parse(playerIdInput);
    return ConversationAccessRevokedEventV2Schema.parse({
      eventId: this.eventId(),
      eventType: 'conversation.access_revoked.v2',
      eventVersion: 2,
      aggregateType: 'conversation',
      aggregateId: stored.snapshot.conversationId,
      aggregateVersion: stored.snapshot.version,
      actorPlayerId,
      correlationId,
      causationId,
      occurredAt,
      payload: {
        conversationId: stored.snapshot.conversationId,
        playerId,
        reason,
      },
    });
  }

  private now() {
    return this.clock().toISOString();
  }

  private eventId() {
    return EventIdSchema.parse(this.createUuid());
  }
}

function sourceKey(source: ConversationSourceV2) {
  return `${source.sourceType}:${source.sourceId}`;
}

function listenerKey(conversationId: string, playerId: string) {
  return `${conversationId}:${playerId}`;
}

function normalizedMembers(
  members: readonly AuthoritativeConversationMemberV2[],
) {
  return [...members]
    .map((member) => ({ playerId: member.playerId, role: member.role }))
    .sort((left, right) => left.playerId.localeCompare(right.playerId));
}

function normalizedActiveMembers(members: Map<string, ConversationMemberV2>) {
  return normalizedMembers(
    [...members.values()].filter(
      (member): member is ConversationMemberV2 & { role: 'owner' | 'member' } =>
        member.state === 'active' && member.role !== 'system',
    ),
  );
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createUuid() {
  // Lazy native import keeps pure contract tests independent of Expo ESM.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('expo-crypto') as typeof import('expo-crypto');
  return crypto.randomUUID();
}
