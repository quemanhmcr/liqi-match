import { heroDefinitionById } from '@/entities/hero';
import type { SimulationOperationContext } from '@/shared/simulation';
import {
  appendSimulationMessage,
  assetKey,
  messageId,
  type AssetKey,
  type ConversationId,
  type MessageId,
  type ProductionSimulationRuntime,
  type ProfileId,
  type SimulatedConversation,
  type SimulatedMessage,
  type SimulatedProfile,
  type SimulationWorldSnapshot,
} from '@/entities/simulation';

import type {
  MessageAssetRef,
  MessageConversationDetail,
  MessageConversationSummary,
  MessageTimelineItem,
} from '../contracts/messages-contracts';
import { MessagesServiceError } from '../contracts/messages-contracts';
import { matchesMessageInboxFilter } from '../model/message-inbox-filter';
import type {
  SendChatMediaCommand,
  SendChatTextCommand,
} from './chat-message-transport';
import type { MessagesRequestContext } from './chat-repository';
import {
  createSimulationMessagesAdapter,
  successfulMessageMutation,
  type SimulationMessageMutationOutcome,
  type SimulationMessagesAdapter,
  type SimulationMessagesProjection,
} from './simulation-messages-adapter';

export type CanonicalSimulationMessagesAdapterOptions = Readonly<{
  runtime: ProductionSimulationRuntime;
  viewerIdForRequest?: (
    world: Readonly<SimulationWorldSnapshot>,
    request: MessagesRequestContext,
  ) => ProfileId;
}>;

export function createCanonicalSimulationMessagesAdapter(
  options: CanonicalSimulationMessagesAdapterOptions,
): SimulationMessagesAdapter<SimulationWorldSnapshot> {
  const viewerIdForRequest =
    options.viewerIdForRequest ?? defaultViewerIdForRequest;
  const projection: SimulationMessagesProjection<SimulationWorldSnapshot> = {
    getConversation: (world, conversationId, context) => {
      const conversation =
        world.conversations[conversationId as ConversationId];
      if (!conversation) return null;
      const viewerId = viewerIdForRequest(world, context.request);
      if (!conversation.memberIds.includes(viewerId)) return null;
      return conversationDetail(world, conversation, viewerId);
    },
    getMessagePage: (world, conversationId, query, context) => {
      const conversation =
        world.conversations[conversationId as ConversationId];
      if (!conversation) {
        return {
          items: [],
          pageInfo: { hasNextPage: false, nextCursor: null },
        };
      }
      const viewerId = viewerIdForRequest(world, context.request);
      if (!conversation.memberIds.includes(viewerId)) {
        throw new MessagesServiceError(
          'forbidden',
          'Bạn không thuộc hội thoại mô phỏng này.',
          false,
        );
      }
      const all = conversation.messageIds.map((id) =>
        timelineItem(world, requireMessage(world, id), viewerId),
      );
      const end = parseTimelineCursor(
        query.cursor,
        conversation.id,
        all.length,
      );
      const start = Math.max(0, end - query.limit);
      const selected = all.slice(start, end);
      const count = partialCount(selected.length, context.runtime.fault);
      const items = selected.slice(selected.length - count);
      const nextEnd = end - items.length;
      const nextCursor =
        nextEnd > 0 ? `timeline:v1:${conversation.id}:${nextEnd}` : null;
      return {
        items,
        pageInfo: {
          hasNextPage: nextCursor !== null,
          nextCursor,
        },
      };
    },
    listConversations: (world, query, context) => {
      const viewerId = viewerIdForRequest(world, context.request);
      const normalizedQuery = query.query.trim().toLocaleLowerCase('vi');
      const all = Object.values(world.conversations)
        .filter((conversation) => conversation.memberIds.includes(viewerId))
        .map((conversation) =>
          conversationSummary(world, conversation, viewerId),
        )
        .filter((conversation) =>
          matchesMessageInboxFilter(conversation, query.filter),
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
      const offset = parseInboxCursor(query.cursor);
      if (offset > all.length) {
        throw staleCursor('Messages inbox cursor is outside the result set.');
      }
      const selected = all.slice(offset, offset + query.limit);
      const count = partialCount(selected.length, context.runtime.fault);
      const items = selected.slice(0, count);
      const nextOffset = offset + items.length;
      const nextCursor =
        nextOffset < all.length ? `inbox:v1:${nextOffset}` : null;
      const unreadConversationCount = Object.values(world.conversations)
        .filter((conversation) => conversation.memberIds.includes(viewerId))
        .map((conversation) => viewerState(world, conversation, viewerId))
        .filter((state) => state.unreadCount > 0).length;
      return {
        items,
        pageInfo: {
          hasNextPage: nextCursor !== null,
          nextCursor,
        },
        totalCount: all.length,
        unreadConversationCount,
      };
    },
  };

  return createSimulationMessagesAdapter({
    mutations: {
      sendMedia: (world, command, context) =>
        sendMediaMessage(
          world,
          command,
          context.clock.now().toISOString(),
          context.fault,
        ),
      sendText: (world, command, context) =>
        sendTextMessage(world, command, context.clock.now().toISOString()),
    },
    projection,
    runtime: options.runtime,
  });
}

function defaultViewerIdForRequest(
  world: Readonly<SimulationWorldSnapshot>,
  request: MessagesRequestContext,
) {
  const requested = request.viewerId as ProfileId;
  return world.profiles[requested] ? requested : world.viewerId;
}

function conversationSummary(
  world: Readonly<SimulationWorldSnapshot>,
  conversation: SimulatedConversation,
  viewerId: ProfileId,
): MessageConversationSummary {
  const members = conversation.memberIds.map((id) =>
    participant(world, conversation, requireProfile(world, id)),
  );
  const previewMembers = members
    .filter((member) => member.id !== viewerId)
    .slice(0, 3);
  const latest = conversation.messageIds.length
    ? requireMessage(world, conversation.messageIds.at(-1)!)
    : null;
  const directPeer = directConversationPeer(world, conversation, viewerId);
  const state = viewerState(world, conversation, viewerId);

  return {
    ...(conversationAvatar(world, conversation, directPeer)
      ? { avatar: conversationAvatar(world, conversation, directPeer)! }
      : {}),
    capabilities: conversationCapabilities(conversation),
    ...(conversation.kind === 'system'
      ? { fallbackIcon: 'notifications' }
      : {}),
    id: conversation.id,
    kind: conversation.kind,
    latestActivity: latest ? latestActivity(world, latest, viewerId) : null,
    participants: {
      preview: previewMembers,
      totalCount: conversation.memberIds.length,
    },
    presence: conversationPresence(directPeer),
    relationship: conversation.relationship,
    title: conversationTitle(world, conversation, directPeer),
    viewerState: state,
  };
}

function conversationDetail(
  world: Readonly<SimulationWorldSnapshot>,
  conversation: SimulatedConversation,
  viewerId: ProfileId,
): MessageConversationDetail {
  const summary = conversationSummary(world, conversation, viewerId);
  const canMessage = summary.capabilities.canMessage;
  return {
    ...summary,
    composer: canMessage
      ? { placeholder: 'Nhắn tin...' }
      : {
          disabledReason: 'Hội thoại này không hỗ trợ trả lời',
          placeholder: 'Không thể nhắn tin',
        },
    liveState: {
      typingParticipantIds: conversation.typingProfileIds.filter(
        (profileId) => profileId !== viewerId,
      ),
    },
    members: conversation.memberIds.map((id) =>
      participant(world, conversation, requireProfile(world, id)),
    ),
    subtitle:
      conversation.kind === 'direct'
        ? summary.presence.label
        : `${conversation.memberIds.length} thành viên`,
  };
}

function participant(
  world: Readonly<SimulationWorldSnapshot>,
  conversation: SimulatedConversation,
  profile: SimulatedProfile,
) {
  const avatar = profile.media.avatarAssetKey
    ? fixtureAsset(world, profile.media.avatarAssetKey)
    : undefined;
  const set = conversation.setId ? world.sets[conversation.setId] : undefined;
  return {
    ...(avatar ? { avatar } : {}),
    displayName: profile.canonicalProfile.profileBasics.displayName,
    id: profile.id,
    role:
      set?.ownerId === profile.id ? ('owner' as const) : ('member' as const),
  };
}

function conversationCapabilities(conversation: SimulatedConversation) {
  const readOnly = conversation.kind === 'system';
  return {
    canCall: !readOnly,
    canMessage: !readOnly,
    canMute: !readOnly,
    canViewDetails: true,
    composerActions: readOnly
      ? []
      : [
          { id: 'image' as const, state: 'available' as const },
          { id: 'camera' as const, state: 'available' as const },
          { id: 'team_invite' as const, state: 'coming_soon' as const },
          { id: 'build_share' as const, state: 'coming_soon' as const },
          { id: 'voice' as const, state: 'coming_soon' as const },
        ],
  };
}

function directConversationPeer(
  world: Readonly<SimulationWorldSnapshot>,
  conversation: SimulatedConversation,
  viewerId: ProfileId,
) {
  if (conversation.kind !== 'direct') return null;
  const peerId = conversation.memberIds.find((id) => id !== viewerId);
  return peerId ? requireProfile(world, peerId) : null;
}

function conversationTitle(
  world: Readonly<SimulationWorldSnapshot>,
  conversation: SimulatedConversation,
  directPeer: SimulatedProfile | null,
) {
  if (conversation.title) return conversation.title;
  if (directPeer) return directPeer.canonicalProfile.profileBasics.displayName;
  if (conversation.setId) return world.sets[conversation.setId]?.title ?? 'Set';
  return 'Hệ thống';
}

function conversationAvatar(
  world: Readonly<SimulationWorldSnapshot>,
  conversation: SimulatedConversation,
  directPeer: SimulatedProfile | null,
) {
  if (directPeer?.media.avatarAssetKey) {
    return fixtureAsset(world, directPeer.media.avatarAssetKey);
  }
  if (conversation.setId) {
    const set = world.sets[conversation.setId];
    if (set) return fixtureAsset(world, set.artworkAssetKey);
  }
  return undefined;
}

function conversationPresence(peer: SimulatedProfile | null) {
  if (!peer) return { label: 'Hội thoại nhóm', state: 'hidden' as const };
  const labels = {
    hidden: 'Ẩn trạng thái',
    offline: 'Ngoại tuyến',
    online: 'Đang online',
    recently_online: 'Vừa hoạt động',
  } as const;
  return { label: labels[peer.presence.state], state: peer.presence.state };
}

function viewerState(
  world: Readonly<SimulationWorldSnapshot>,
  conversation: SimulatedConversation,
  viewerId: ProfileId,
) {
  const state = conversation.memberState[viewerId];
  if (!state) {
    throw new MessagesServiceError(
      'contract_violation',
      `Conversation ${conversation.id} is missing viewer member state.`,
      false,
    );
  }
  const readIndex = state.lastReadMessageId
    ? conversation.messageIds.indexOf(state.lastReadMessageId)
    : -1;
  const unread = conversation.messageIds
    .slice(readIndex + 1)
    .map((id) => requireMessage(world, id))
    .filter((message) => message.senderId !== viewerId);
  return {
    ...(unread[0] ? { firstUnreadMessageId: unread[0].id } : {}),
    isArchived: state.archivedAt !== null,
    isMuted: state.isMuted,
    isPinned: state.isPinned,
    unreadCount: unread.length,
  };
}

function latestActivity(
  world: Readonly<SimulationWorldSnapshot>,
  message: SimulatedMessage,
  viewerId: ProfileId,
) {
  const outgoing = message.senderId === viewerId;
  const sender = message.senderId
    ? world.profiles[message.senderId]
    : undefined;
  return {
    createdAt: message.createdAt,
    ...(outgoing ? { deliveryStatus: message.deliveryStatus } : {}),
    direction: outgoing ? ('outgoing' as const) : ('incoming' as const),
    id: message.id,
    kind: latestMessageKind(message),
    preview: messagePreview(message),
    ...(!outgoing && sender
      ? {
          senderDisplayName: sender.canonicalProfile.profileBasics.displayName,
        }
      : {}),
  };
}

function timelineItem(
  world: Readonly<SimulationWorldSnapshot>,
  message: SimulatedMessage,
  viewerId: ProfileId,
): MessageTimelineItem {
  const outgoing = message.senderId === viewerId;
  const base = {
    createdAt: message.createdAt,
    ...(outgoing ? { deliveryStatus: message.deliveryStatus } : {}),
    direction: outgoing ? ('outgoing' as const) : ('incoming' as const),
    id: message.id,
    ...(message.senderId ? { senderId: message.senderId } : {}),
  };

  switch (message.kind) {
    case 'text':
      return { ...base, kind: 'text', text: message.text };
    case 'media': {
      const asset = world.assets[message.assetKey];
      return {
        ...base,
        altText: message.altText,
        caption: message.caption,
        fileName: message.fileName,
        fileSize: message.fileSize,
        ...(asset?.height ? { height: asset.height } : {}),
        kind: 'media',
        mediaType: message.mediaType,
        source: fixtureAsset(world, message.assetKey),
        ...(asset?.width ? { width: asset.width } : {}),
      };
    }
    case 'build_share':
      return {
        ...base,
        heroName: heroDefinitionById(message.heroId)?.name ?? message.heroId,
        kind: 'build_share',
        preview: fixtureAsset(world, message.previewAssetKey),
        roleIcon: fixtureAsset(world, message.roleIconAssetKey),
        summary: message.summary,
        tags: [...message.tags],
        text: message.text,
      };
    case 'team_invite': {
      const set = world.sets[message.setId];
      if (!set) {
        throw new MessagesServiceError(
          'contract_violation',
          `Message ${message.id} references missing set ${message.setId}.`,
          false,
        );
      }
      return {
        ...base,
        artwork: fixtureAsset(world, set.artworkAssetKey),
        kind: 'team_invite',
        members: set.memberIds.map(
          (id) =>
            requireProfile(world, id).canonicalProfile.profileBasics
              .displayName,
        ),
        missingRole: set.missingLaneIds[0] ?? 'Linh hoạt',
        mode: set.mode,
        teamName: set.title,
        teamSize: `${set.memberIds.length}/${set.capacity}`,
        text: message.text,
      };
    }
  }
}

function sendTextMessage(
  world: SimulationWorldSnapshot,
  command: SendChatTextCommand,
  acceptedAt: string,
): SimulationMessageMutationOutcome<{
  acceptedAt: string;
  canonicalMessageId: string;
  clientMessageId: string;
}> {
  const conversation = writableConversation(world, command.conversationId);
  if (!command.text.trim()) {
    return rejectedMessage(
      command.clientMessageId,
      acceptedAt,
      'Tin nhắn trống.',
    );
  }
  const id = canonicalMessageId(command.clientMessageId);
  const existing = world.messages[id];
  if (existing) {
    if (
      existing.kind === 'text' &&
      existing.conversationId === conversation.id &&
      existing.senderId === world.viewerId &&
      existing.text === command.text
    ) {
      return successfulMessageMutation({
        acceptedAt: existing.createdAt,
        canonicalMessageId: existing.id,
        clientMessageId: command.clientMessageId,
      });
    }
    return rejectedMessage(
      command.clientMessageId,
      acceptedAt,
      'Canonical message id đã tồn tại với payload khác.',
    );
  }
  appendSimulationMessage(world, {
    message: {
      conversationId: conversation.id,
      createdAt: acceptedAt,
      deliveryStatus: 'sent',
      id,
      kind: 'text',
      senderId: world.viewerId,
      text: command.text,
    },
    now: acceptedAt,
  });
  conversation.memberState[world.viewerId]!.lastReadMessageId = id;
  return successfulMessageMutation({
    acceptedAt,
    canonicalMessageId: id,
    clientMessageId: command.clientMessageId,
  });
}

function sendMediaMessage(
  world: SimulationWorldSnapshot,
  command: SendChatMediaCommand,
  acceptedAt: string,
  fault: SimulationOperationContext['fault'],
): SimulationMessageMutationOutcome<{
  acceptedAt: string;
  canonicalMessageId: string;
  clientMessageId: string;
}> {
  if (fault?.kind === 'partial_failure') {
    return rejectedMessage(
      command.clientMessageId,
      acceptedAt,
      fault.code,
      fault.retryable ?? true,
    );
  }
  const conversation = writableConversation(world, command.conversationId);
  const id = canonicalMessageId(command.clientMessageId);
  const existing = world.messages[id];
  if (existing) {
    if (
      existing.kind === 'media' &&
      existing.conversationId === conversation.id &&
      existing.senderId === world.viewerId
    ) {
      return successfulMessageMutation({
        acceptedAt: existing.createdAt,
        canonicalMessageId: existing.id,
        clientMessageId: command.clientMessageId,
      });
    }
    return rejectedMessage(
      command.clientMessageId,
      acceptedAt,
      'Canonical message id đã tồn tại với payload khác.',
    );
  }

  const mediaAssetKey = canonicalMessageAssetKey(command.clientMessageId);
  world.assets[mediaAssetKey] = {
    altText:
      command.media.altText ??
      (command.media.mediaType === 'video'
        ? 'Video tin nhắn mô phỏng'
        : 'Ảnh tin nhắn mô phỏng'),
    ...(command.media.height ? { height: command.media.height } : {}),
    key: mediaAssetKey,
    kind:
      command.media.mediaType === 'video' ? 'message-video' : 'message-image',
    mimeType: command.media.mediaType === 'video' ? 'video/mp4' : 'image/webp',
    owner: { id, kind: 'message' },
    state: 'available',
    ...(command.media.width ? { width: command.media.width } : {}),
  };
  appendSimulationMessage(world, {
    message: {
      altText: world.assets[mediaAssetKey]!.altText,
      assetKey: mediaAssetKey,
      caption: command.caption ?? '',
      conversationId: conversation.id,
      createdAt: acceptedAt,
      deliveryStatus: 'sent',
      fileName:
        command.media.fileName ??
        (command.media.mediaType === 'video'
          ? 'simulation-video.mp4'
          : 'simulation-image.webp'),
      fileSize: command.media.fileSize ?? 0,
      id,
      kind: 'media',
      mediaType: command.media.mediaType,
      senderId: world.viewerId,
    },
    now: acceptedAt,
  });
  conversation.memberState[world.viewerId]!.lastReadMessageId = id;
  return successfulMessageMutation({
    acceptedAt,
    canonicalMessageId: id,
    clientMessageId: command.clientMessageId,
  });
}

function writableConversation(
  world: SimulationWorldSnapshot,
  conversationId: string,
) {
  const conversation = world.conversations[conversationId as ConversationId];
  if (!conversation || !conversation.memberIds.includes(world.viewerId)) {
    throw new MessagesServiceError(
      'forbidden',
      'Conversation không tồn tại hoặc viewer không phải thành viên.',
      false,
    );
  }
  if (conversation.kind === 'system') {
    throw new MessagesServiceError(
      'forbidden',
      'System conversation is read-only.',
      false,
    );
  }
  return conversation;
}

function rejectedMessage(
  clientMessageId: string,
  acceptedAt: string,
  message: string,
  retryable = false,
): SimulationMessageMutationOutcome<{
  acceptedAt: string;
  canonicalMessageId: string;
  clientMessageId: string;
}> {
  return {
    failure: { code: 'rejected', message, retryable },
    receipt: {
      acceptedAt,
      canonicalMessageId: canonicalMessageId(clientMessageId),
      clientMessageId,
    },
  };
}

function canonicalMessageId(clientMessageId: string): MessageId {
  const normalized = clientMessageId
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return messageId(
    `message:client:${normalized || 'message'}:${stableHash(clientMessageId)}`,
  );
}

function canonicalMessageAssetKey(clientMessageId: string): AssetKey {
  return assetKey(`asset:message:client:${stableHash(clientMessageId)}`);
}

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function fixtureAsset(
  world: Readonly<SimulationWorldSnapshot>,
  key: AssetKey,
): MessageAssetRef {
  const asset = world.assets[key];
  if (!asset) {
    throw new MessagesServiceError(
      'contract_violation',
      `Missing canonical message asset ${key}.`,
      false,
    );
  }
  return {
    altText: asset.altText,
    assetKey: asset.key,
    ...(asset.height ? { height: asset.height } : {}),
    kind: 'fixture',
    ...(asset.width ? { width: asset.width } : {}),
  };
}

function requireProfile(
  world: Readonly<SimulationWorldSnapshot>,
  id: ProfileId,
) {
  const profile = world.profiles[id];
  if (!profile) {
    throw new MessagesServiceError(
      'contract_violation',
      `Missing canonical profile ${id}.`,
      false,
    );
  }
  return profile;
}

function requireMessage(
  world: Readonly<SimulationWorldSnapshot>,
  id: MessageId,
) {
  const message = world.messages[id];
  if (!message) {
    throw new MessagesServiceError(
      'contract_violation',
      `Missing canonical message ${id}.`,
      false,
    );
  }
  return message;
}

function messagePreview(message: SimulatedMessage) {
  switch (message.kind) {
    case 'text':
      return message.text;
    case 'media':
      return (
        message.caption ||
        (message.mediaType === 'video' ? 'Đã gửi một video' : 'Đã gửi một ảnh')
      );
    case 'build_share':
      return message.text;
    case 'team_invite':
      return message.text;
  }
}

function latestMessageKind(message: SimulatedMessage) {
  if (message.kind === 'media') return message.mediaType;
  return message.kind;
}

function parseInboxCursor(cursor?: string) {
  if (!cursor) return 0;
  const match = /^inbox:v1:(\d+)$/.exec(cursor);
  if (!match) throw staleCursor('Messages inbox cursor is invalid.');
  return Number(match[1]);
}

function parseTimelineCursor(
  cursor: string | undefined,
  conversationId: ConversationId,
  fallback: number,
) {
  if (!cursor) return fallback;
  const prefix = `timeline:v1:${escapeRegExp(conversationId)}:`;
  const match = new RegExp(`^${prefix}(\\d+)$`).exec(cursor);
  if (!match) throw staleCursor('Messages timeline cursor is invalid.');
  const value = Number(match[1]);
  if (value > fallback) {
    throw staleCursor('Messages timeline cursor is outside the result set.');
  }
  return value;
}

function staleCursor(message: string) {
  return new MessagesServiceError('stale_cursor', message, true);
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

function partialCount(
  length: number,
  fault: {
    kind: 'partial_failure' | 'partial_response';
    limit?: number;
    ratio?: number;
  } | null,
) {
  if (fault?.kind !== 'partial_response') return length;
  if (fault.limit !== undefined) return Math.min(length, fault.limit);
  return Math.min(length, Math.floor(length * (fault.ratio ?? 0.5)));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
