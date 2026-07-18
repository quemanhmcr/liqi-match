import {
  MessageReportEvidenceIdV2Schema,
  type AuthoritativeConversationMemberV2,
  type ConversationCommandReceiptV2,
  type ConversationMemberV2,
  type ConversationSourceV2,
  type MessageV2,
} from '@/shared/contracts/core-v2';
import type { PlayerId } from '@/shared/contracts/core-v1';

import { ConversationV2ProviderError } from './conversation-v2-error';
import type {
  ConversationAccessProvider,
  ConversationEventLogV2,
  ConversationLifecycleProvider,
  ConversationMembershipProjection,
  ConversationModerationProvider,
  ConversationNotificationProvider,
  ConversationProvisioningService,
  ConversationRelationshipProjection,
  ConversationRepository,
  MessageTransport,
} from './conversation-v2-provider';

export type InMemoryConversationV2AuthorityOptions = Readonly<{
  clock?: () => Date;
  createUuid?: () => string;
  notificationProvider?: ConversationNotificationProvider;
}>;

export type ConversationV2Authority = ConversationRepository &
  ConversationProvisioningService &
  ConversationRelationshipProjection &
  ConversationMembershipProjection &
  MessageTransport &
  ConversationAccessProvider &
  ConversationModerationProvider &
  ConversationLifecycleProvider &
  ConversationEventLogV2;

export type ConversationReadReceiptStore = Map<
  string,
  ConversationCommandReceiptV2
>;

export type StoredReceipt = {
  fingerprint: string;
  receipt: ConversationCommandReceiptV2;
};

export type StoredEvidence = Readonly<{
  evidenceId: ReturnType<typeof MessageReportEvidenceIdV2Schema.parse>;
  conversationId: string;
  message: MessageV2;
  reporterPlayerId: PlayerId;
  capturedAt: string;
  reportId: string;
}>;

export function sourceKey(source: ConversationSourceV2) {
  return `${source.sourceType}:${source.sourceId}`;
}

export function listenerKey(conversationId: string, playerId: string) {
  return `${conversationId}:${playerId}`;
}

export function normalizedMembers(
  members: readonly AuthoritativeConversationMemberV2[],
) {
  return [...members]
    .map((member) => ({ playerId: member.playerId, role: member.role }))
    .sort((left, right) => left.playerId.localeCompare(right.playerId));
}

export function directPairKey(playerIds: readonly string[]) {
  if (playerIds.length !== 2 || playerIds[0] === playerIds[1]) {
    throw new ConversationV2ProviderError(
      'validation_failed',
      'Direct conversations require exactly two distinct players.',
      false,
    );
  }
  return [...playerIds].sort().join(':');
}

export function normalizedActiveMembers(
  members: Map<string, ConversationMemberV2>,
) {
  return normalizedMembers(
    [...members.values()].filter(
      (member): member is ConversationMemberV2 & { role: 'owner' | 'member' } =>
        member.state === 'active' && member.role !== 'system',
    ),
  );
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function stripStoredEvidence(evidence: StoredEvidence) {
  return {
    capturedAt: evidence.capturedAt,
    conversationId: evidence.conversationId,
    evidenceId: evidence.evidenceId,
    message: evidence.message,
    reporterPlayerId: evidence.reporterPlayerId,
  };
}

export function createUuid() {
  // Lazy native import keeps pure contract tests independent of Expo ESM.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('expo-crypto') as typeof import('expo-crypto');
  return crypto.randomUUID();
}
