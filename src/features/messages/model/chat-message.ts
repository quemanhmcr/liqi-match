import type { ComponentProps } from 'react';
import type { ImageSourcePropType } from 'react-native';

import type { ResolvedAsset } from '@/entities/media-asset';

type IoniconName = ComponentProps<
  typeof import('@expo/vector-icons').Ionicons
>['name'];

export type MessageResolvedMedia =
  | { kind: 'asset'; resolved: ResolvedAsset }
  | { kind: 'remote'; source: ImageSourcePropType; state: 'ready'; uri: string }
  | { kind: 'unresolved'; state: 'missing' };

export function messageResolvedMediaSource(
  media: MessageResolvedMedia,
): ImageSourcePropType | undefined {
  if (media.kind === 'asset') return media.resolved.source;
  if (media.kind === 'remote') return media.source;
  return undefined;
}

export function messageResolvedMediaState(media: MessageResolvedMedia) {
  return media.kind === 'asset' ? media.resolved.state : media.state;
}

export function messageResolvedMediaUri(media: MessageResolvedMedia) {
  if (media.kind === 'remote') return media.uri;
  const source = messageResolvedMediaSource(media);
  return typeof source === 'object' && source && 'uri' in source
    ? source.uri
    : undefined;
}

export type ChatDeliveryStatus =
  'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type ChatMediaAttachment = {
  altText?: string;
  durationMs?: number;
  fileName?: string;
  fileSize?: number;
  height?: number;
  mediaType: 'image' | 'video';
  resolvedMedia?: MessageResolvedMedia;
  mimeType?: string;
  thumbnailUri?: string;
  uri: string;
  width?: number;
};

type TimestampedMessage = {
  createdAt: string;
  senderId?: string;
};

type OutgoingMessageState = TimestampedMessage & {
  canonicalId?: string;
  deliveryStatus: ChatDeliveryStatus;
  direction: 'outgoing';
  id: string;
};

export type IncomingTextMessage = TimestampedMessage & {
  direction: 'incoming';
  id: string;
  kind: 'text';
  text: string;
};

export type OutgoingTextMessage = OutgoingMessageState & {
  kind: 'text';
  text: string;
};

export type IncomingMediaMessage = TimestampedMessage & {
  attachment: ChatMediaAttachment;
  caption?: string;
  direction: 'incoming';
  id: string;
  kind: 'media';
};

export type OutgoingMediaMessage = OutgoingMessageState & {
  attachment: ChatMediaAttachment;
  caption?: string;
  kind: 'media';
  mediaFailureReason?: 'cancelled' | 'send-failed';
  transferProgress?: number;
};

export type OutgoingChatMessage = OutgoingTextMessage | OutgoingMediaMessage;

export type ChatMessage =
  | IncomingTextMessage
  | IncomingMediaMessage
  | OutgoingChatMessage
  | (TimestampedMessage & {
      direction: 'incoming';
      heroName: string;
      id: string;
      kind: 'build-share';
      preview: MessageResolvedMedia;
      roleIcon: MessageResolvedMedia;
      summary: string;
      tags: readonly string[];
      text: string;
    })
  | (TimestampedMessage & {
      direction: 'incoming';
      id: string;
      kind: 'team-invite';
      members: readonly string[];
      missingRole: string;
      mode: string;
      teamName: string;
      teamSize: string;
      text: string;
    })
  | {
      direction: 'incoming';
      id: string;
      kind: 'typing';
    };

export type ChatThread = {
  avatar?: MessageResolvedMedia;
  icon?: IoniconName;
  firstUnreadMessageId?: string;
  id: string;
  isOnline?: boolean;
  kind: 'Bạn bè' | 'Hệ thống' | 'Team' | 'Tri kỉ';
  messages: readonly ChatMessage[];
  name: string;
  status: string;
  unreadCount?: number;
};

export type ChatMessagePreview = {
  createdAt: string;
  deliveryStatus?: ChatDeliveryStatus;
  direction: 'incoming' | 'outgoing';
  text: string;
};

export function getOutgoingMessagePreviewText(message: OutgoingChatMessage) {
  if (message.kind === 'text') return message.text;
  return message.attachment.mediaType === 'video'
    ? 'Đã gửi một video'
    : 'Đã gửi một ảnh';
}

export function getLatestMessagePreview(
  fixtureMessages: readonly ChatMessage[],
  runtimeMessages: readonly OutgoingChatMessage[] = [],
): ChatMessagePreview | undefined {
  const runtimeMessage = runtimeMessages[runtimeMessages.length - 1];
  if (runtimeMessage) {
    return {
      createdAt: runtimeMessage.createdAt,
      deliveryStatus: runtimeMessage.deliveryStatus,
      direction: 'outgoing',
      text: getOutgoingMessagePreviewText(runtimeMessage),
    };
  }

  for (let index = fixtureMessages.length - 1; index >= 0; index -= 1) {
    const message = fixtureMessages[index];
    if (!message || message.kind === 'typing') continue;

    return {
      createdAt: message.createdAt,
      deliveryStatus:
        message.direction === 'outgoing' ? message.deliveryStatus : undefined,
      direction: message.direction,
      text:
        message.direction === 'outgoing'
          ? getOutgoingMessagePreviewText(message)
          : message.kind === 'media'
            ? message.attachment.mediaType === 'video'
              ? 'Đã gửi một video'
              : 'Đã gửi một ảnh'
            : message.text,
    };
  }

  return undefined;
}
