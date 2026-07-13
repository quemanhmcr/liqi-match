import type { ComponentProps } from 'react';
import { canonicalAssetKey, type AssetResolver } from '@/entities/media-asset';

import type {
  MessageAssetRef,
  MessageConversationDetail,
  MessageConversationSummary,
  MessageRelationship,
  MessageTimelineItem,
} from '../contracts/messages-contracts';
import type {
  ChatDeliveryStatus,
  ChatMessage,
  ChatThread,
  MessageResolvedMedia,
  OutgoingChatMessage,
} from './chat-message';
import { getOutgoingMessagePreviewText } from './chat-message';
import { formatInboxTimestamp } from './chat-timeline';

type IoniconName = ComponentProps<
  typeof import('@expo/vector-icons').Ionicons
>['name'];

export type MessageConversationTone = 'cyan' | 'muted' | 'orange' | 'purple';

export type MessageInboxConversationViewModel = {
  activityAt?: string;
  avatar?: MessageResolvedMedia;
  canMessage: boolean;
  icon?: IoniconName;
  id: string;
  isDraft: boolean;
  isGroup: boolean;
  isMuted: boolean;
  isOnline: boolean;
  isPinned: boolean;
  lastMessage: string;
  latestDeliveryStatus?: ChatDeliveryStatus;
  latestDirection?: 'incoming' | 'outgoing';
  name: string;
  presenceLabel: string;
  previewPrefix?: string;
  relationship: MessageRelationship;
  relationshipLabel: string;
  time: string;
  tone: MessageConversationTone;
  unreadCount?: number;
};

const threadKindByRelationship: Record<
  MessageRelationship,
  ChatThread['kind']
> = {
  friend: 'Bạn bè',
  soulmate: 'Tri kỉ',
  system: 'Hệ thống',
  team: 'Team',
};

const relationshipLabelByKind: Record<MessageRelationship, string> = {
  friend: 'Bạn bè',
  soulmate: 'Tri kỉ',
  system: 'Thông báo',
  team: 'Team',
};

const toneByRelationship: Record<MessageRelationship, MessageConversationTone> =
  {
    friend: 'cyan',
    soulmate: 'purple',
    system: 'purple',
    team: 'orange',
  };

function fallbackDeliveryStatus(
  message: MessageTimelineItem,
): ChatDeliveryStatus {
  return message.deliveryStatus ?? 'delivered';
}

export function presentTimelineMessage(
  message: MessageTimelineItem,
  assetResolver: AssetResolver,
): ChatMessage {
  const base = {
    createdAt: message.createdAt,
    id: message.id,
    senderId: message.senderId,
  };

  if (message.kind === 'text') {
    return message.direction === 'outgoing'
      ? {
          ...base,
          deliveryStatus: fallbackDeliveryStatus(message),
          direction: 'outgoing',
          kind: 'text',
          text: message.text,
        }
      : {
          ...base,
          direction: 'incoming',
          kind: 'text',
          text: message.text,
        };
  }

  if (message.kind === 'media') {
    const resolvedMedia = resolveMessageMedia(message.source, assetResolver);
    const uri = resolvedMedia.kind === 'remote' ? resolvedMedia.uri : '';
    const attachment = {
      altText: message.altText,
      durationMs: message.durationMs,
      fileName: message.fileName,
      fileSize: message.fileSize,
      height: message.height,
      mediaType: message.mediaType,
      resolvedMedia,
      thumbnailUri: message.mediaType === 'image' ? uri : undefined,
      uri,
      width: message.width,
    } as const;

    return message.direction === 'outgoing'
      ? {
          ...base,
          attachment,
          caption: message.caption,
          deliveryStatus: fallbackDeliveryStatus(message),
          direction: 'outgoing',
          kind: 'media',
        }
      : {
          ...base,
          attachment,
          caption: message.caption,
          direction: 'incoming',
          kind: 'media',
        };
  }

  if (message.kind === 'build_share') {
    const preview = resolveMessageMedia(message.preview, assetResolver);
    const roleIcon = resolveMessageMedia(message.roleIcon, assetResolver);
    return {
      ...base,
      direction: 'incoming',
      heroName: message.heroName,
      kind: 'build-share',
      preview,
      roleIcon,
      summary: message.summary,
      tags: message.tags,
      text: message.text,
    };
  }

  return {
    ...base,
    artwork: resolveMessageMedia(message.artwork, assetResolver),
    direction: 'incoming',
    kind: 'team-invite',
    members: message.members,
    missingRole: message.missingRole,
    mode: message.mode,
    teamName: message.teamName,
    teamSize: message.teamSize,
    text: message.text,
  };
}

export function presentConversationThread(
  conversation: MessageConversationDetail,
  timeline: readonly MessageTimelineItem[],
  assetResolver: AssetResolver,
): ChatThread {
  const messages = timeline.map((message) =>
    presentTimelineMessage(message, assetResolver),
  );
  if (conversation.liveState.typingParticipantIds.length > 0) {
    messages.push({
      direction: 'incoming',
      id: `typing:${conversation.id}`,
      kind: 'typing',
    });
  }

  return {
    avatar: conversation.avatar
      ? resolveMessageMedia(conversation.avatar, assetResolver)
      : undefined,
    firstUnreadMessageId: conversation.viewerState.firstUnreadMessageId,
    icon: conversation.fallbackIcon as IoniconName | undefined,
    id: conversation.id,
    isOnline: conversation.presence.state === 'online',
    kind: threadKindByRelationship[conversation.relationship],
    messages,
    name: conversation.title,
    status: conversation.subtitle,
    unreadCount: conversation.viewerState.unreadCount || undefined,
  };
}

export function presentInboxConversation({
  assetResolver,
  conversation,
  draftPreview,
  draftUpdatedAt,
  isRead,
  referenceDate,
  runtimeMessages,
}: {
  assetResolver: AssetResolver;
  conversation: MessageConversationSummary;
  draftPreview?: string;
  draftUpdatedAt?: number;
  isRead: boolean;
  referenceDate: Date;
  runtimeMessages: readonly OutgoingChatMessage[];
}): MessageInboxConversationViewModel {
  const runtimeMessage = runtimeMessages[runtimeMessages.length - 1];
  const draft = (draftPreview ?? '').trim();
  const isDraft = draft.length > 0;
  const draftActivityAt =
    isDraft && draftUpdatedAt
      ? new Date(draftUpdatedAt).toISOString()
      : undefined;
  const latestActivity = runtimeMessage
    ? {
        createdAt: runtimeMessage.createdAt,
        deliveryStatus: runtimeMessage.deliveryStatus,
        direction: 'outgoing' as const,
        preview: getOutgoingMessagePreviewText(runtimeMessage),
      }
    : conversation.latestActivity;
  const activityAt =
    runtimeMessage?.createdAt ?? draftActivityAt ?? latestActivity?.createdAt;
  const latestDirection = isDraft ? undefined : latestActivity?.direction;
  const senderPrefix =
    latestDirection === 'incoming' && conversation.kind === 'group'
      ? conversation.latestActivity?.senderDisplayName
      : undefined;

  return {
    activityAt,
    avatar: conversation.avatar
      ? resolveMessageMedia(conversation.avatar, assetResolver)
      : undefined,
    canMessage: conversation.capabilities.canMessage,
    icon: conversation.fallbackIcon as IoniconName | undefined,
    id: conversation.id,
    isDraft,
    isGroup: conversation.kind === 'group',
    isMuted: conversation.viewerState.isMuted,
    isOnline: conversation.presence.state === 'online',
    isPinned: conversation.viewerState.isPinned,
    lastMessage: isDraft ? draft : (latestActivity?.preview ?? ''),
    latestDeliveryStatus: isDraft ? undefined : latestActivity?.deliveryStatus,
    latestDirection,
    name: conversation.title,
    presenceLabel: conversation.presence.label,
    previewPrefix: isDraft
      ? 'Bản nháp:'
      : latestDirection === 'outgoing'
        ? 'Bạn:'
        : senderPrefix
          ? `${senderPrefix}:`
          : undefined,
    relationship: conversation.relationship,
    relationshipLabel: relationshipLabelByKind[conversation.relationship],
    time: activityAt ? formatInboxTimestamp(activityAt, referenceDate) : '',
    tone: toneByRelationship[conversation.relationship],
    unreadCount:
      !isDraft && !isRead && !runtimeMessage
        ? conversation.viewerState.unreadCount || undefined
        : undefined,
  };
}

function resolveMessageMedia(
  asset: MessageAssetRef,
  assetResolver: AssetResolver,
): MessageResolvedMedia {
  if (asset.kind === 'remote') {
    return {
      kind: 'remote',
      source: { uri: asset.url },
      state: 'ready',
      uri: asset.url,
    };
  }
  const assetKey = canonicalAssetKey(asset.assetKey);
  if (!assetKey) return { kind: 'unresolved', state: 'missing' };
  return { kind: 'asset', resolved: assetResolver.resolve(assetKey) };
}
