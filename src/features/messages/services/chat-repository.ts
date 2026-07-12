import type { ChatMessage, ChatThread } from '../model/chat-message';
import {
  findChatThreadFixture,
  listChatThreadFixtures,
} from '../data/chat-thread.fixture';
import {
  MessageConversationResponseSchema,
  MessageInboxParamsSchema,
  MessageInboxResponseSchema,
  MessageTimelineParamsSchema,
  MessageTimelineResponseSchema,
  MessagesServiceError,
  messagesContractVersion,
  type CanonicalMessageInboxParams,
  type MessageAssetRef,
  type MessageConversationCapabilities,
  type MessageConversationDetail,
  type MessageConversationKind,
  type MessageConversationSummary,
  type MessageInboxParams,
  type MessageRelationship,
  type MessageTimelineItem,
  type MessageTimelineParams,
  type MessagesResponse,
} from '../contracts/messages-contracts';
import { getOutgoingMessagePreviewText } from '../model/chat-message';

export const DEFAULT_CHAT_MESSAGE_PAGE_SIZE = 30;
export const DEFAULT_MESSAGE_INBOX_PAGE_SIZE = 30;

export type MessagesRequestContext = {
  signal?: AbortSignal;
  locale: string;
  timezone: string;
  viewerId: string;
};

export const previewMessagesRequestContext: MessagesRequestContext = {
  locale: 'vi-VN',
  timezone: 'Asia/Ho_Chi_Minh',
  viewerId: 'preview-viewer',
};

export interface ChatRepository {
  getConversation(
    conversationId: string,
    context?: MessagesRequestContext,
  ): Promise<MessagesResponse<MessageConversationDetail> | null>;
  getMessagePage(
    conversationId: string,
    query?: MessageTimelineParams,
    context?: MessagesRequestContext,
  ): Promise<
    MessagesResponse<{
      items: MessageTimelineItem[];
      pageInfo: { hasNextPage: boolean; nextCursor: string | null };
    }>
  >;
  listConversations(
    query?: MessageInboxParams,
    context?: MessagesRequestContext,
  ): Promise<
    MessagesResponse<{
      items: MessageConversationSummary[];
      pageInfo: { hasNextPage: boolean; nextCursor: string | null };
      totalCount: number;
      unreadConversationCount: number;
    }>
  >;
}

const avatarAssetKeyByConversationId: Record<string, string | undefined> = {
  'aya-only': 'avatar:energetic-carry',
  'cozy-helen': 'avatar:cozy-gamer',
  'cyber-violet': 'avatar:cyber-girl',
  'huy-hoang': 'avatar:black-fighter',
  'khoa-jungle': 'avatar:silver-assassin',
  lorian: 'avatar:ice-prince',
  'minh-anh': 'avatar:pink-support',
  'quoc-bao': 'avatar:blonde-mage',
  'team-sao-bang': 'team:sao-bang',
};

const incomingSenderByConversationId: Record<string, string | undefined> = {
  'aya-only': 'Helen',
  system: 'Hệ thống',
  'team-sao-bang': 'Yue',
};

const pinnedConversationIds = new Set(['minh-anh', 'team-sao-bang']);
const mutedConversationIds = new Set(['khoa-jungle']);
const groupConversationIds = new Set(['aya-only', 'team-sao-bang']);
let requestSequence = 0;

function fixtureAsset(assetKey: string, altText?: string): MessageAssetRef {
  return { altText, assetKey, kind: 'fixture' };
}

function relationshipForThread(thread: ChatThread): MessageRelationship {
  if (thread.kind === 'Tri kỉ') return 'soulmate';
  if (thread.kind === 'Team') return 'team';
  if (thread.kind === 'Hệ thống') return 'system';
  return 'friend';
}

function conversationKindForThread(
  thread: ChatThread,
): MessageConversationKind {
  if (thread.kind === 'Hệ thống') return 'system';
  if (thread.kind === 'Team' || groupConversationIds.has(thread.id)) {
    return 'group';
  }
  return 'direct';
}

function capabilitiesForThread(
  thread: ChatThread,
): MessageConversationCapabilities {
  const readOnly = thread.kind === 'Hệ thống';
  return {
    canCall: !readOnly,
    canMessage: !readOnly,
    canMute: !readOnly,
    canViewDetails: true,
    composerActions: readOnly
      ? []
      : [
          { id: 'image', state: 'available' },
          { id: 'camera', state: 'available' },
          { id: 'team_invite', state: 'coming_soon' },
          { id: 'build_share', state: 'coming_soon' },
          { id: 'voice', state: 'coming_soon' },
        ],
  };
}

function latestTimestampedFixtureMessage(messages: readonly ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.kind !== 'typing') return message;
  }
  return undefined;
}

function previewForMessage(message: Exclude<ChatMessage, { kind: 'typing' }>) {
  if (message.direction === 'outgoing') {
    return getOutgoingMessagePreviewText(message);
  }
  if (message.kind === 'media') {
    return message.attachment.mediaType === 'video'
      ? 'Đã gửi một video'
      : 'Đã gửi một ảnh';
  }
  return message.text;
}

function latestKindForMessage(
  message: Exclude<ChatMessage, { kind: 'typing' }>,
) {
  if (message.kind === 'build-share') return 'build_share' as const;
  if (message.kind === 'team-invite') return 'team_invite' as const;
  if (message.kind === 'media') return message.attachment.mediaType;
  return 'text' as const;
}

function participantForThread(thread: ChatThread) {
  const assetKey = avatarAssetKeyByConversationId[thread.id];
  return {
    avatar: assetKey
      ? fixtureAsset(assetKey, `Ảnh đại diện ${thread.name}`)
      : undefined,
    displayName: thread.name,
    id: `participant:${thread.id}`,
    role:
      thread.kind === 'Hệ thống' ? ('system' as const) : ('member' as const),
  };
}

function memberListForThread(thread: ChatThread) {
  if (thread.id === 'team-sao-bang') {
    return ['Yue', 'Lorian', 'Minh Anh', 'Aya Only'].map(
      (displayName, index) => ({
        displayName,
        id: `participant:team-sao-bang:${index + 1}`,
        role: index === 0 ? ('owner' as const) : ('member' as const),
      }),
    );
  }
  return [participantForThread(thread)];
}

function summaryForThread(thread: ChatThread): MessageConversationSummary {
  const latestMessage = latestTimestampedFixtureMessage(thread.messages);
  const assetKey = avatarAssetKeyByConversationId[thread.id];
  const participant = participantForThread(thread);
  const relationship = relationshipForThread(thread);

  return {
    avatar: assetKey
      ? fixtureAsset(assetKey, `Ảnh đại diện ${thread.name}`)
      : undefined,
    capabilities: capabilitiesForThread(thread),
    fallbackIcon: thread.icon,
    id: thread.id,
    kind: conversationKindForThread(thread),
    latestActivity: latestMessage
      ? {
          createdAt: latestMessage.createdAt,
          deliveryStatus:
            latestMessage.direction === 'outgoing'
              ? latestMessage.deliveryStatus
              : undefined,
          direction: latestMessage.direction,
          id: latestMessage.id,
          kind: latestKindForMessage(latestMessage),
          preview: previewForMessage(latestMessage),
          senderDisplayName:
            latestMessage.direction === 'incoming'
              ? (incomingSenderByConversationId[thread.id] ??
                (thread.kind === 'Team' ? thread.name : undefined))
              : undefined,
        }
      : null,
    participants: {
      preview: thread.kind === 'Hệ thống' ? [] : [participant],
      totalCount:
        thread.id === 'team-sao-bang'
          ? 5
          : thread.id === 'aya-only'
            ? 3
            : thread.kind === 'Hệ thống'
              ? 0
              : 2,
    },
    presence: {
      label: thread.status,
      state: thread.isOnline ? 'online' : 'recently_online',
    },
    relationship,
    title: thread.name,
    viewerState: {
      firstUnreadMessageId: thread.firstUnreadMessageId,
      isArchived: false,
      isMuted: mutedConversationIds.has(thread.id),
      isPinned: pinnedConversationIds.has(thread.id),
      unreadCount: thread.unreadCount ?? 0,
    },
  };
}

function detailForThread(thread: ChatThread): MessageConversationDetail {
  const summary = summaryForThread(thread);
  const readOnly = !summary.capabilities.canMessage;
  return {
    ...summary,
    composer: {
      disabledReason: readOnly
        ? 'Thông báo này không hỗ trợ trả lời'
        : undefined,
      placeholder: 'Nhắn tin...',
    },
    liveState: {
      typingParticipantIds: thread.messages.some(
        (message) => message.kind === 'typing',
      )
        ? [`participant:${thread.id}`]
        : [],
    },
    members: memberListForThread(thread),
    subtitle: thread.status,
  };
}

function timelineMessageFromFixture(
  message: Exclude<ChatMessage, { kind: 'typing' }>,
): MessageTimelineItem {
  const base = {
    createdAt: message.createdAt,
    deliveryStatus:
      message.direction === 'outgoing' ? message.deliveryStatus : undefined,
    direction: message.direction,
    id: message.id,
    senderId: message.senderId,
  };

  if (message.kind === 'text') {
    return { ...base, kind: 'text', text: message.text };
  }
  if (message.kind === 'build-share') {
    return {
      ...base,
      heroName: message.heroName,
      kind: 'build_share',
      preview: fixtureAsset('build:nakroth', message.heroName),
      roleIcon: fixtureAsset('role:jungle', 'Biểu tượng Đi Rừng'),
      summary: message.summary,
      tags: [...message.tags],
      text: message.text,
    };
  }
  if (message.kind === 'team-invite') {
    return {
      ...base,
      kind: 'team_invite',
      members: [...message.members],
      missingRole: message.missingRole,
      mode: message.mode,
      teamName: message.teamName,
      teamSize: message.teamSize,
      text: message.text,
    };
  }

  return {
    ...base,
    altText: message.attachment.altText,
    caption: message.caption,
    durationMs: message.attachment.durationMs,
    fileName: message.attachment.fileName,
    fileSize: message.attachment.fileSize,
    height: message.attachment.height,
    kind: 'media',
    mediaType: message.attachment.mediaType,
    source: {
      altText: message.attachment.altText,
      id: `media:${message.id}`,
      kind: 'remote',
      url: message.attachment.uri,
    },
    width: message.attachment.width,
  };
}

function response<T>(data: T): MessagesResponse<T> {
  requestSequence += 1;
  return {
    contractVersion: messagesContractVersion,
    data,
    meta: {
      generatedAt: new Date().toISOString(),
      requestId: `messages-preview-${requestSequence}`,
    },
  };
}

function parseOffsetCursor(
  cursor: string | undefined,
  prefix: string,
  fallback = 0,
) {
  if (!cursor) return fallback;
  const match = new RegExp(`^${prefix}:(\\d+)$`).exec(cursor);
  if (!match) {
    throw new MessagesServiceError(
      'stale_cursor',
      'Cursor tin nhắn không hợp lệ hoặc đã hết hạn.',
      true,
    );
  }
  return Number(match[1]);
}

function matchesInboxFilter(
  conversation: MessageConversationSummary,
  filter: CanonicalMessageInboxParams['filter'],
) {
  if (filter === 'all') return true;
  if (filter === 'unread') return conversation.viewerState.unreadCount > 0;
  if (filter === 'friends') return conversation.relationship === 'friend';
  if (filter === 'soulmates') return conversation.relationship === 'soulmate';
  return conversation.relationship === 'team';
}

function compareConversationActivity(
  left: MessageConversationSummary,
  right: MessageConversationSummary,
) {
  if (left.viewerState.isPinned !== right.viewerState.isPinned) {
    return left.viewerState.isPinned ? -1 : 1;
  }
  return (right.latestActivity?.createdAt ?? '').localeCompare(
    left.latestActivity?.createdAt ?? '',
  );
}

export function createLocalChatRepository({
  pageSize = DEFAULT_CHAT_MESSAGE_PAGE_SIZE,
}: {
  pageSize?: number;
} = {}): ChatRepository {
  return {
    async getConversation(conversationId) {
      const thread = findChatThreadFixture(conversationId);
      if (!thread) return null;
      return MessageConversationResponseSchema.parse(
        response(detailForThread(thread)),
      );
    },
    async getMessagePage(conversationId, input = {}) {
      const canonical = MessageTimelineParamsSchema.parse({
        limit: pageSize,
        ...input,
      });
      const thread = findChatThreadFixture(conversationId);
      if (!thread) {
        return MessageTimelineResponseSchema.parse(
          response({
            items: [],
            pageInfo: { hasNextPage: false, nextCursor: null },
          }),
        );
      }

      const allMessages = thread.messages
        .filter(
          (message): message is Exclude<ChatMessage, { kind: 'typing' }> =>
            message.kind !== 'typing',
        )
        .map(timelineMessageFromFixture);
      const end = Math.min(
        parseOffsetCursor(
          canonical.cursor,
          `timeline:v1:${conversationId}`,
          allMessages.length,
        ),
        allMessages.length,
      );
      const start = Math.max(0, end - canonical.limit);
      const nextCursor =
        start > 0 ? `timeline:v1:${conversationId}:${start}` : null;

      return MessageTimelineResponseSchema.parse(
        response({
          items: allMessages.slice(start, end),
          pageInfo: {
            hasNextPage: nextCursor !== null,
            nextCursor,
          },
        }),
      );
    },
    async listConversations(input = {}) {
      const canonical = MessageInboxParamsSchema.parse({
        limit: DEFAULT_MESSAGE_INBOX_PAGE_SIZE,
        ...input,
      });
      const normalizedQuery = canonical.query.trim().toLocaleLowerCase('vi');
      const all = listChatThreadFixtures()
        .map(summaryForThread)
        .filter((conversation) =>
          matchesInboxFilter(conversation, canonical.filter),
        )
        .filter((conversation) => {
          if (!normalizedQuery) return true;
          return [
            conversation.title,
            conversation.latestActivity?.preview ?? '',
            conversation.latestActivity?.senderDisplayName ?? '',
          ].some((value) =>
            value.toLocaleLowerCase('vi').includes(normalizedQuery),
          );
        })
        .sort(compareConversationActivity);
      const offset = parseOffsetCursor(canonical.cursor, 'inbox:v1');
      const items = all.slice(offset, offset + canonical.limit);
      const nextOffset = offset + items.length;
      const nextCursor =
        nextOffset < all.length ? `inbox:v1:${nextOffset}` : null;
      const unreadConversationCount = listChatThreadFixtures().filter(
        (thread) => (thread.unreadCount ?? 0) > 0,
      ).length;

      return MessageInboxResponseSchema.parse(
        response({
          items,
          pageInfo: {
            hasNextPage: nextCursor !== null,
            nextCursor,
          },
          totalCount: all.length,
          unreadConversationCount,
        }),
      );
    },
  };
}

/**
 * Frontend composition point. The current implementation is deterministic and
 * local. A backend adapter only needs to implement ChatRepository and replace
 * this binding; screens consume the versioned contract, not fixture shapes.
 */
export const localChatRepository: ChatRepository = createLocalChatRepository();
