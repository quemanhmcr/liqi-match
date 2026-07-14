import type {
  AdvanceReadCursorCommandV2,
  ConversationAccessV2,
  ConversationCommandReceiptV2,
  ConversationEventV2,
  ConversationMemberV2,
  ConversationReadCursorV2,
  ConversationSnapshotV2,
  ConversationSourceBindingV2,
  ConversationSourceV2,
  ConversationSystemActivityInputV2,
  MessageReportEvidenceIdV2,
  MessageV2,
  ProvisionDirectConversationCommandV2,
  ProvisionSessionConversationCommandV2,
  RelationshipConversationProjectionInputV2,
  RelationshipConversationProjectionReceiptV2,
  ReconcileConversationMembershipCommandV2,
  SendMediaMessageCommandV2,
  SendMessageCommandV2,
  TombstoneConversationCommandV2,
  ConversationMuteCommandV2,
} from '@/shared/contracts/core-v2';
import type { AccountId, PlayerId } from '@/shared/contracts/core-v1';

export type VerifiedConversationActorV2 = Readonly<{
  accountId: AccountId;
  playerId: PlayerId;
  lifecycleVersion: number;
  messagingAllowed: true;
}>;

export type ConversationInboxItemV2 = Readonly<{
  conversation: ConversationSnapshotV2;
  members: readonly ConversationMemberV2[];
  readCursor: ConversationReadCursorV2;
  muted: boolean;
  unreadCount: number;
}>;

export interface ConversationRepository {
  getConversation(
    actor: VerifiedConversationActorV2,
    conversationId: string,
  ): Promise<ConversationSnapshotV2 | null>;
  getTimeline(
    actor: VerifiedConversationActorV2,
    conversationId: string,
  ): Promise<readonly MessageV2[]>;
  listInbox(
    actor: VerifiedConversationActorV2,
  ): Promise<readonly ConversationInboxItemV2[]>;
  getSources(
    actor: VerifiedConversationActorV2,
    conversationId: string,
  ): Promise<readonly ConversationSourceBindingV2[]>;
}

export interface ConversationProvisioningService {
  provisionDirect(
    actor: VerifiedConversationActorV2 | null,
    command: ProvisionDirectConversationCommandV2,
  ): Promise<ConversationCommandReceiptV2>;
  provisionSession(
    actor: VerifiedConversationActorV2 | null,
    command: ProvisionSessionConversationCommandV2,
  ): Promise<ConversationCommandReceiptV2>;
}

export type ConversationSystemActivityV2 = ConversationSystemActivityInputV2;

export interface ConversationRelationshipProjection {
  applyRelationship(
    input: RelationshipConversationProjectionInputV2,
  ): Promise<RelationshipConversationProjectionReceiptV2>;
}

export interface ConversationMembershipProjection {
  reconcile(
    actor: VerifiedConversationActorV2 | null,
    command: ReconcileConversationMembershipCommandV2,
  ): Promise<ConversationCommandReceiptV2>;
  projectSystemActivity(
    activity: ConversationSystemActivityV2,
  ): Promise<MessageV2>;
}

export interface MessageTransport {
  advanceReadCursor(
    actor: VerifiedConversationActorV2,
    command: AdvanceReadCursorCommandV2,
  ): Promise<ConversationCommandReceiptV2>;
  sendMedia(
    actor: VerifiedConversationActorV2,
    command: SendMediaMessageCommandV2,
  ): Promise<ConversationCommandReceiptV2>;
  sendText(
    actor: VerifiedConversationActorV2,
    command: SendMessageCommandV2,
  ): Promise<ConversationCommandReceiptV2>;
}

export type ConversationNotificationFactV2 = Readonly<{
  conversationId: string;
  messageId: string;
  recipientPlayerId: PlayerId;
  senderPlayerId: PlayerId | null;
  correlationId: string;
  source: ConversationSourceV2;
}>;

export interface ConversationNotificationProvider {
  publish(fact: ConversationNotificationFactV2): Promise<void>;
}

export interface ConversationAccessProvider {
  getAccess(
    actor: VerifiedConversationActorV2,
    conversationId: string,
  ): Promise<ConversationAccessV2>;
  subscribeAccess(
    actor: VerifiedConversationActorV2,
    conversationId: string,
    listener: (access: ConversationAccessV2) => void,
  ): { remove(): void };
}

export interface ConversationModerationProvider {
  captureReportEvidence(input: {
    actor: VerifiedConversationActorV2;
    conversationId: string;
    messageId: string;
    reportId: string;
  }): Promise<
    Readonly<{
      evidenceId: MessageReportEvidenceIdV2;
      conversationId: string;
      message: MessageV2;
      reporterPlayerId: PlayerId;
      capturedAt: string;
    }>
  >;
}

export interface ConversationLifecycleProvider {
  mute(
    actor: VerifiedConversationActorV2,
    command: ConversationMuteCommandV2,
  ): Promise<ConversationCommandReceiptV2>;
  unmute(
    actor: VerifiedConversationActorV2,
    command: ConversationMuteCommandV2,
  ): Promise<ConversationCommandReceiptV2>;
  tombstone(
    actor: VerifiedConversationActorV2 | null,
    command: TombstoneConversationCommandV2,
  ): Promise<ConversationCommandReceiptV2>;
}

export interface ConversationEventLogV2 {
  events(): readonly ConversationEventV2[];
}
