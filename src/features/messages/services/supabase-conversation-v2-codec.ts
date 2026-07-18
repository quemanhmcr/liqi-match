import { Platform } from 'react-native';
import { z } from 'zod';

import { env } from '@/shared/config/env';
import {
  ConversationAccessV2Schema,
  ConversationReadCursorV2Schema,
  ConversationSourceV2Schema,
  CoreV2CommandMetadataSchema,
  MessageV2Schema,
} from '@/shared/contracts/core-v2';

import {
  MessagesServiceError,
  type MessageConversationDetail,
  type MessageConversationSummary,
  type MessageParticipant,
  type MessageTimelineItem,
} from '../contracts/messages-contracts';

const ParticipantSurfaceV2Schema = z.object({
  avatarAssetId: z.string().uuid().nullable(),
  displayName: z.string().min(1),
  isSelf: z.boolean(),
  lifecycleState: z.enum([
    'registered',
    'onboarding',
    'active',
    'suspended',
    'deleting',
    'deleted',
  ]),
  memberState: z.enum(['active', 'revoked']),
  playerId: z.string().uuid(),
  profileId: z.string().uuid(),
  role: z.enum(['owner', 'member', 'system']),
});

const CombinedMessageContentV2Schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string() }).passthrough(),
  z
    .object({
      assetId: z.string().uuid(),
      caption: z.string().optional(),
      kind: z.literal('media'),
    })
    .passthrough(),
  z.object({ kind: z.literal('system') }).passthrough(),
]);

const CombinedMessageV2Schema = z
  .object({
    clientMessageId: z.string().min(1),
    content: CombinedMessageContentV2Schema,
    conversationId: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    messageId: z.string().uuid(),
    senderPlayerId: z.string().uuid().nullable(),
    sequence: z.number().int().positive(),
    tombstonedAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .default(null),
  })
  .passthrough();

const ConversationMobileSurfaceV2Schema = z
  .object({
    conversationId: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    firstUnreadMessageId: z.string().uuid().nullable(),
    kind: z.enum(['direct', 'group', 'system']),
    lastSequence: z.number().int().nonnegative(),
    latestMessage: CombinedMessageV2Schema.nullable(),
    muted: z.boolean(),
    participants: z.array(ParticipantSurfaceV2Schema),
    readCursor: ConversationReadCursorV2Schema,
    source: ConversationSourceV2Schema,
    state: z.enum(['open', 'tombstoned']),
    title: z.string().trim().min(1).max(160).nullable(),
    tombstonedAt: z.string().datetime({ offset: true }).nullable(),
    unreadCount: z.number().int().nonnegative(),
    updatedAt: z.string().datetime({ offset: true }),
    version: z.number().int().positive(),
    viewer: ConversationAccessV2Schema,
  })
  .passthrough();

const InboxCursorV2Schema = z.object({
  beforeConversationId: z.string().uuid(),
  beforeUpdatedAt: z.string().datetime({ offset: true }),
});

export const ConversationMobileInboxV2Schema = z.object({
  items: z.array(ConversationMobileSurfaceV2Schema),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    nextCursor: InboxCursorV2Schema.nullable(),
  }),
  totalCount: z.number().int().nonnegative(),
  unreadConversationCount: z.number().int().nonnegative(),
});

export const ConversationTimelineV2Schema = z.object({
  items: z.array(CombinedMessageV2Schema),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    nextCursor: z.number().int().positive().nullable(),
  }),
});

export const ConversationCommandReceiptSurfaceV2Schema = z
  .object({
    acceptedAt: z.string().datetime({ offset: true }),
    aggregateVersion: z.number().int().positive(),
    conversationId: z.string().uuid(),
    message: MessageV2Schema.optional(),
    readCursor: ConversationReadCursorV2Schema.optional(),
    repeated: z.boolean(),
  })
  .passthrough();

export type ConversationMobileSurfaceV2 = z.infer<
  typeof ConversationMobileSurfaceV2Schema
>;
export type CombinedMessageV2 = z.infer<typeof CombinedMessageV2Schema>;
type InboxCursorV2 = z.infer<typeof InboxCursorV2Schema>;

export function parseSurface(raw: unknown) {
  const parsed = ConversationMobileSurfaceV2Schema.safeParse(raw);
  if (!parsed.success) {
    throw new MessagesServiceError(
      'contract_violation',
      'Conversation V2 API trả dữ liệu không hợp lệ.',
      false,
      parsed.error.message,
    );
  }
  return parsed.data;
}

export function toConversationSummary(
  surface: ConversationMobileSurfaceV2,
): MessageConversationSummary {
  const others = surface.participants.filter(
    (participant) => !participant.isSelf,
  );
  const participantPreview = others.slice(0, 3).map(toParticipant);
  const directPeer = others[0];
  const title =
    surface.title ??
    (surface.kind === 'direct'
      ? directPeer?.displayName
      : others
          .slice(0, 3)
          .map((participant) => participant.displayName)
          .join(', ')) ??
    'Cuộc trò chuyện Liqi';
  const canMessage = surface.viewer.canSend && surface.state === 'open';
  return {
    avatar: directPeer?.avatarAssetId
      ? remoteAsset(
          directPeer.avatarAssetId,
          `Ảnh đại diện ${directPeer.displayName}`,
        )
      : undefined,
    capabilities: {
      canCall: false,
      canMessage,
      canMute: surface.viewer.canRead && surface.state === 'open',
      canViewDetails: surface.viewer.canRead,
      composerActions: canMessage
        ? [
            { id: 'image', state: 'available' },
            { id: 'camera', state: 'available' },
          ]
        : [],
    },
    fallbackIcon:
      surface.kind === 'group'
        ? 'people-outline'
        : 'chatbubble-ellipses-outline',
    id: surface.conversationId,
    kind: surface.kind,
    latestActivity: surface.latestMessage
      ? toLatestActivity(
          surface.latestMessage,
          surface.viewer.playerId,
          surface.participants,
        )
      : null,
    participants: {
      preview: participantPreview,
      totalCount: surface.participants.length,
    },
    presence: { label: subtitleForSurface(surface), state: 'hidden' },
    relationship: relationshipForSource(surface),
    source: {
      id: surface.source.sourceId,
      type: surface.source.sourceType,
    },
    title,
    viewerState: {
      firstUnreadMessageId: surface.firstUnreadMessageId ?? undefined,
      isArchived: false,
      isMuted: surface.muted,
      isPinned: false,
      unreadCount: surface.unreadCount,
    },
  };
}

export function toConversationDetail(
  surface: ConversationMobileSurfaceV2,
): MessageConversationDetail {
  const summary = toConversationSummary(surface);
  return {
    ...summary,
    composer: {
      disabledReason: summary.capabilities.canMessage
        ? undefined
        : accessDisabledReason(surface),
      placeholder: 'Nhắn tin...',
    },
    liveState: { typingParticipantIds: [] },
    members: surface.participants.map(toParticipant),
    subtitle: subtitleForSurface(surface),
  };
}

function toParticipant(
  participant: z.infer<typeof ParticipantSurfaceV2Schema>,
): MessageParticipant {
  return {
    avatar: participant.avatarAssetId
      ? remoteAsset(
          participant.avatarAssetId,
          `Ảnh đại diện ${participant.displayName}`,
        )
      : undefined,
    displayName: participant.displayName,
    id: participant.playerId,
    role: participant.role,
  };
}

function toLatestActivity(
  message: CombinedMessageV2,
  viewerPlayerId: string,
  participants: readonly z.infer<typeof ParticipantSurfaceV2Schema>[],
) {
  const outgoing = message.senderPlayerId === viewerPlayerId;
  const sender = participants.find(
    (participant) => participant.playerId === message.senderPlayerId,
  );
  return {
    clientMessageId: message.clientMessageId,
    createdAt: message.createdAt,
    deliveryStatus: outgoing ? ('sent' as const) : undefined,
    direction: outgoing ? ('outgoing' as const) : ('incoming' as const),
    id: message.messageId,
    kind:
      message.content.kind === 'media' ? ('image' as const) : ('text' as const),
    preview: previewForMessage(message),
    senderDisplayName: outgoing ? undefined : sender?.displayName,
    sequence: message.sequence,
  };
}

export function toTimelineItem(
  message: CombinedMessageV2,
  viewerPlayerId: string,
): MessageTimelineItem {
  const base = {
    clientMessageId: message.clientMessageId,
    createdAt: message.createdAt,
    deliveryStatus:
      message.senderPlayerId === viewerPlayerId ? ('sent' as const) : undefined,
    direction:
      message.senderPlayerId === viewerPlayerId
        ? ('outgoing' as const)
        : ('incoming' as const),
    id: message.messageId,
    senderId: message.senderPlayerId ?? undefined,
    sequence: message.sequence,
  };
  if (message.tombstonedAt) {
    return { ...base, kind: 'text', text: 'Tin nhắn đã bị xoá' };
  }
  if (message.content.kind === 'text') {
    return { ...base, kind: 'text', text: message.content.text };
  }
  if (message.content.kind === 'media') {
    return {
      ...base,
      caption: message.content.caption,
      kind: 'media',
      mediaType: 'image',
      source: remoteAsset(message.content.assetId),
    };
  }
  return { ...base, kind: 'text', text: systemMessagePreview(message.content) };
}

function previewForMessage(message: CombinedMessageV2) {
  if (message.tombstonedAt) return 'Tin nhắn đã bị xoá';
  if (message.content.kind === 'text') return message.content.text;
  if (message.content.kind === 'media') {
    return message.content.caption || 'Đã gửi một ảnh';
  }
  return systemMessagePreview(message.content);
}

function systemMessagePreview(content: Record<string, unknown>) {
  const eventType = String(content.sourceEventType ?? content.eventType ?? '');
  if (eventType.includes('member_joined')) return 'Thành viên đã tham gia nhóm';
  if (eventType.includes('member_left')) return 'Thành viên đã rời nhóm';
  if (eventType.includes('friendship.accepted'))
    return 'Hai bạn đã trở thành bạn bè';
  if (eventType.includes('session.started')) return 'Phiên chơi đã bắt đầu';
  if (eventType.includes('session.completed')) return 'Phiên chơi đã hoàn tất';
  if (eventType.includes('session.cancelled')) return 'Phiên chơi đã bị huỷ';
  return 'Hoạt động trong cuộc trò chuyện';
}

function relationshipForSource(surface: ConversationMobileSurfaceV2) {
  if (surface.kind === 'system' || surface.source.sourceType === 'system') {
    return 'system' as const;
  }
  if (surface.source.sourceType === 'play_session') return 'team' as const;
  if (surface.source.sourceType === 'friendship') return 'friend' as const;
  return 'match' as const;
}

function subtitleForSurface(surface: ConversationMobileSurfaceV2) {
  if (surface.state === 'tombstoned') return 'Cuộc trò chuyện đã kết thúc';
  if (surface.kind === 'group') {
    return `${surface.participants.length} thành viên`;
  }
  if (surface.source.sourceType === 'friendship') return 'Bạn bè';
  if (surface.source.sourceType === 'direct_match') return 'Đã ghép đôi';
  return 'Cuộc trò chuyện';
}

function accessDisabledReason(surface: ConversationMobileSurfaceV2) {
  if (surface.state === 'tombstoned') {
    return 'Cuộc trò chuyện đã kết thúc';
  }
  if (surface.viewer.reason === 'blocked') return 'Không thể nhắn tin do chặn';
  if (surface.viewer.reason === 'source_membership_revoked') {
    return 'Bạn không còn là thành viên của nhóm';
  }
  return 'Cuộc trò chuyện hiện không thể nhận tin nhắn mới';
}

function remoteAsset(assetId: string, altText?: string) {
  return {
    ...(altText ? { altText } : {}),
    id: assetId,
    kind: 'remote' as const,
    url: new URL(
      `media/${encodeURIComponent(assetId)}`,
      env.EXPO_PUBLIC_MEDIA_BASE_URL.endsWith('/')
        ? env.EXPO_PUBLIC_MEDIA_BASE_URL
        : `${env.EXPO_PUBLIC_MEDIA_BASE_URL}/`,
    ).toString(),
  };
}

export function commandMetadata(
  idempotencyKey: string,
  clientCreatedAt: string,
  expectedAggregateVersion: number,
) {
  const correlationId = stableUuid(idempotencyKey);
  return CoreV2CommandMetadataSchema.parse({
    audit: {
      clientCreatedAt,
      clientPlatform: clientPlatform(),
      requestId: `conversation-v2:${correlationId}`,
    },
    causationId: null,
    correlationId,
    expectedAggregateVersion,
    idempotencyKey,
  });
}

export function stableCommandKey(
  prefix: string,
  identity: string,
  version: number,
) {
  return `${prefix}:${stableUuid(identity)}:${version}`;
}

export function stableUuid(value: string) {
  const hash = cyrb128(value);
  const bytes = hash.flatMap((part) => [
    (part >>> 24) & 255,
    (part >>> 16) & 255,
    (part >>> 8) & 255,
    part & 255,
  ]);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function cyrb128(value: string) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

export function encodeTimelineCursor(
  conversationId: string,
  beforeSequence: number,
) {
  return `timeline:v2:${conversationId}:${beforeSequence}`;
}

export function decodeTimelineCursor(
  cursor: string | undefined,
  conversationId: string,
) {
  if (!cursor) return null;
  const match = /^timeline:v2:([0-9a-f-]{36}):(\d+)$/i.exec(cursor);
  if (!match || match[1] !== conversationId) {
    throw new MessagesServiceError(
      'stale_cursor',
      'Cursor timeline V2 không hợp lệ.',
      true,
    );
  }
  return Number(match[2]);
}

export function encodeInboxCursor(cursor: InboxCursorV2) {
  return `inbox:v2:${encodeURIComponent(cursor.beforeUpdatedAt)}:${cursor.beforeConversationId}`;
}

export function decodeInboxCursor(
  cursor: string | undefined,
): InboxCursorV2 | null {
  if (!cursor) return null;
  const match = /^inbox:v2:([^:]+):([0-9a-f-]{36})$/i.exec(cursor);
  if (!match?.[1] || !match[2]) {
    throw new MessagesServiceError(
      'stale_cursor',
      'Cursor hộp thư V2 không hợp lệ.',
      true,
    );
  }
  return InboxCursorV2Schema.parse({
    beforeUpdatedAt: decodeURIComponent(match[1]),
    beforeConversationId: match[2],
  });
}

function clientPlatform(): 'android' | 'ios' | 'web' {
  return Platform.OS === 'android' || Platform.OS === 'ios'
    ? Platform.OS
    : 'web';
}
