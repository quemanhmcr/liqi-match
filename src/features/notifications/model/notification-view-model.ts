import type { ImageSourcePropType } from 'react-native';

import type { AssetResolver, ResolvedAsset } from '@/entities/media-asset';
import {
  notificationCategory,
  type NotificationActor,
  type NotificationRecord,
} from '@/entities/notifications';

import {
  resolveNotificationAttentionState,
  type NotificationAttentionState,
} from './notification-attention';

export type NotificationTone = 'blue' | 'cyan' | 'pink' | 'purple';

export type NotificationDestination =
  | { conversationId: string; kind: 'conversation' }
  | { kind: 'match'; matchId: string }
  | { kind: 'profile'; playerId: string }
  | { kind: 'set'; setId: string }
  | { kind: 'session_feedback'; sessionId: string }
  | { kind: 'home' };

export type NotificationAction = {
  destination?: NotificationDestination;
  label: string;
};

export type NotificationResolvedMedia =
  | { kind: 'asset'; resolved: ResolvedAsset }
  | { kind: 'remote'; source: ImageSourcePropType; state: 'ready' };

export function notificationResolvedMediaSource(
  media: NotificationResolvedMedia,
): ImageSourcePropType | undefined {
  return media.kind === 'asset' ? media.resolved.source : media.source;
}

export function notificationResolvedMediaState(
  media: NotificationResolvedMedia,
) {
  return media.kind === 'asset' ? media.resolved.state : media.state;
}

export type NotificationVisual =
  | {
      badgeIcon?: string;
      kind: 'avatar';
      media: NotificationResolvedMedia;
      tone: NotificationTone;
    }
  | {
      icon: string;
      kind: 'symbol';
      tone: NotificationTone;
    };

export type NotificationReward = {
  icon: string;
  label: string;
  tone: NotificationTone;
};

export type NotificationItem = {
  action?: NotificationAction;
  attentionState: NotificationAttentionState;
  category: ReturnType<typeof notificationCategory>;
  group: 'Hôm nay' | 'Trước đó';
  id: string;
  messageParts: readonly string[];
  previewAvatars?: readonly NotificationResolvedMedia[];
  reward?: NotificationReward;
  timeLabel: string;
  title: string;
  visual: NotificationVisual;
};

export type MapNotificationOptions = {
  assetResolver: AssetResolver;
  now?: Date;
};

export function mapNotificationToViewModel(
  notification: NotificationRecord,
  { assetResolver, now = new Date() }: MapNotificationOptions,
): NotificationItem {
  const shared = {
    attentionState: resolveNotificationAttentionState(notification),
    category: notificationCategory(notification),
    group: notificationGroup(notification.occurredAt, now),
    id: notification.id,
    timeLabel: formatNotificationTime(notification.occurredAt, now),
  } as const;

  switch (notification.kind) {
    case 'set-invite': {
      const media = resolveNotificationActorMedia(
        notification.payload.actor,
        assetResolver,
      );
      return {
        ...shared,
        action: {
          destination: { kind: 'set', setId: notification.payload.setId },
          label: 'Xem set',
        },
        messageParts: [
          'đã mời bạn vào set',
          `“${notification.payload.setName}”`,
        ],
        title: notification.payload.actor.displayName,
        visual: media
          ? {
              badgeIcon: 'sparkles-outline',
              kind: 'avatar',
              media,
              tone: 'purple',
            }
          : { icon: 'people-outline', kind: 'symbol', tone: 'purple' },
      };
    }
    case 'set-invite-received':
      return {
        ...shared,
        action: {
          destination: { kind: 'set', setId: notification.payload.setId },
          label: 'Xem set',
        },
        messageParts: ['Bạn có lời mời vào set mới'],
        title: 'Lời mời vào set',
        visual: { icon: 'people-outline', kind: 'symbol', tone: 'purple' },
      };
    case 'direct-message': {
      const media = resolveNotificationActorMedia(
        notification.payload.actor,
        assetResolver,
      );
      return {
        ...shared,
        action: {
          destination: {
            conversationId: notification.payload.conversationId,
            kind: 'conversation',
          },
          label: 'Trả lời',
        },
        messageParts: ['đã nhắn cho bạn', `“${notification.payload.excerpt}”`],
        title: notification.payload.actor.displayName,
        visual: media
          ? {
              badgeIcon: 'chatbubble-ellipses-outline',
              kind: 'avatar',
              media,
              tone: 'blue',
            }
          : { icon: 'chatbubble-outline', kind: 'symbol', tone: 'blue' },
      };
    }
    case 'message-received': {
      const actor = notification.payload.actor;
      const media = actor
        ? resolveNotificationActorMedia(actor, assetResolver)
        : undefined;
      return {
        ...shared,
        action: {
          destination: {
            conversationId: notification.payload.conversationId,
            kind: 'conversation',
          },
          label: 'Trả lời',
        },
        messageParts: actor
          ? [
              'đã nhắn cho bạn',
              ...(notification.payload.excerpt
                ? [`“${notification.payload.excerpt}”`]
                : []),
            ]
          : ['Bạn có tin nhắn mới'],
        title: actor?.displayName ?? 'Tin nhắn mới',
        visual:
          actor && media
            ? {
                badgeIcon: 'chatbubble-ellipses-outline',
                kind: 'avatar',
                media,
                tone: 'blue',
              }
            : { icon: 'chatbubble-outline', kind: 'symbol', tone: 'blue' },
      };
    }
    case 'match-created': {
      const player = notification.payload.player;
      const media = player
        ? resolveNotificationActorMedia(player, assetResolver)
        : undefined;
      return {
        ...shared,
        action: {
          destination: { kind: 'match', matchId: notification.payload.matchId },
          label: 'Xem match',
        },
        messageParts: player
          ? ['vừa match với bạn']
          : ['Bạn vừa có một match mới'],
        title: player?.displayName ?? 'Match mới',
        visual:
          player && media
            ? { kind: 'avatar', media, tone: 'pink' }
            : { icon: 'heart-outline', kind: 'symbol', tone: 'pink' },
      };
    }
    case 'join-request':
      return {
        ...shared,
        action: {
          destination: { kind: 'set', setId: notification.payload.setId },
          label: 'Xem yêu cầu',
        },
        messageParts: ['Có người muốn tham gia set của bạn'],
        title: 'Yêu cầu tham gia',
        visual: { icon: 'person-add-outline', kind: 'symbol', tone: 'purple' },
      };
    case 'friendship-requested':
      return {
        ...shared,
        action: {
          destination: {
            kind: 'profile',
            playerId: notification.payload.requesterPlayerId,
          },
          label: 'Xem lời mời',
        },
        messageParts: ['Bạn có một lời mời kết bạn mới'],
        title: 'Lời mời kết bạn',
        visual: { icon: 'person-add-outline', kind: 'symbol', tone: 'purple' },
      };
    case 'friendship-accepted':
      return {
        ...shared,
        action: {
          destination: {
            kind: 'profile',
            playerId: notification.payload.friendPlayerId,
          },
          label: 'Xem bạn bè',
        },
        messageParts: ['Lời mời kết bạn đã được chấp nhận'],
        title: 'Đã trở thành bạn bè',
        visual: { icon: 'people-outline', kind: 'symbol', tone: 'purple' },
      };
    case 'system': {
      const destination = destinationFromDeepLink(
        notification.payload.deepLink,
      );
      return {
        ...shared,
        action: { destination, label: 'Mở' },
        messageParts: ['Có cập nhật mới dành cho bạn'],
        title: 'Hệ thống:',
        visual: {
          icon: 'notifications-outline',
          kind: 'symbol',
          tone: 'blue',
        },
      };
    }
    case 'praise-received': {
      const previewAvatars = notification.payload.actors.flatMap((actor) => {
        const media = resolveNotificationActorMedia(actor, assetResolver);
        return media ? [media] : [];
      });
      return {
        ...shared,
        messageParts: [
          `Bạn nhận được ${notification.payload.count} lời khen mới`,
          'từ đồng đội',
        ],
        previewAvatars,
        title: '',
        visual: { icon: 'heart-outline', kind: 'symbol', tone: 'purple' },
      };
    }
    case 'team-event':
      return {
        ...shared,
        messageParts: [
          'tối nay bắt đầu',
          `lúc ${formatClockTime(notification.payload.startsAt)}`,
        ],
        title: notification.payload.teamName,
        visual: { icon: 'trophy-outline', kind: 'symbol', tone: 'purple' },
      };
    case 'profile-liked': {
      const media = resolveNotificationActorMedia(
        notification.payload.actor,
        assetResolver,
      );
      return {
        ...shared,
        messageParts: ['vừa thích hồ sơ của bạn'],
        reward: { icon: 'heart', label: '', tone: 'pink' },
        title: notification.payload.actor.displayName,
        visual: media
          ? { kind: 'avatar', media, tone: 'pink' }
          : { icon: 'person-outline', kind: 'symbol', tone: 'pink' },
      };
    }
    case 'weekly-reward':
      return {
        ...shared,
        messageParts: ['Bạn nhận thưởng nhiệm vụ tuần'],
        reward: {
          icon: 'diamond-outline',
          label: `x${notification.payload.amount}`,
          tone: 'purple',
        },
        title: 'Hệ thống:',
        visual: {
          icon: 'notifications-outline',
          kind: 'symbol',
          tone: 'blue',
        },
      };
    case 'reputation-changed':
      return {
        ...shared,
        messageParts: [
          `Uy tín của bạn đã tăng lên ${notification.payload.score}`,
        ],
        reward: {
          icon: 'shield-checkmark-outline',
          label: String(notification.payload.score),
          tone: 'cyan',
        },
        title: 'Hệ thống:',
        visual: {
          icon: 'shield-checkmark-outline',
          kind: 'symbol',
          tone: 'cyan',
        },
      };
  }
}

export function formatNotificationTime(occurredAt: string, now = new Date()) {
  const occurred = new Date(occurredAt);
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now.getTime() - occurred.getTime()) / 60_000),
  );

  if (isSameLocalDay(occurred, now)) {
    if (elapsedMinutes < 1) return 'Vừa xong';
    if (elapsedMinutes < 60) return `${elapsedMinutes} phút trước`;
    return `${Math.max(1, Math.floor(elapsedMinutes / 60))} giờ trước`;
  }

  if (isPreviousLocalDay(occurred, now)) return 'Hôm qua';

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
  }).format(occurred);
}

function destinationFromDeepLink(
  deepLink: Extract<
    NotificationRecord,
    { kind: 'system' }
  >['payload']['deepLink'],
): NotificationDestination {
  switch (deepLink.target) {
    case 'conversation':
      return {
        conversationId: deepLink.conversationId,
        kind: 'conversation',
      };
    case 'match':
      return { kind: 'match', matchId: deepLink.matchId };
    case 'profile':
      return { kind: 'profile', playerId: deepLink.playerId };
    case 'set':
      return { kind: 'set', setId: deepLink.setId };
    case 'session_feedback':
      return { kind: 'session_feedback', sessionId: deepLink.sessionId };
    case 'home':
      return { kind: 'home' };
  }
}

function resolveNotificationActorMedia(
  actor: NotificationActor,
  assetResolver: AssetResolver,
): NotificationResolvedMedia | undefined {
  if (actor.avatarUrl) {
    return { kind: 'remote', source: { uri: actor.avatarUrl }, state: 'ready' };
  }
  if (!actor.avatarAssetKey) return undefined;
  return {
    kind: 'asset',
    resolved: assetResolver.resolve(actor.avatarAssetKey),
  };
}

function notificationGroup(occurredAt: string, now: Date) {
  return isSameLocalDay(new Date(occurredAt), now) ? 'Hôm nay' : 'Trước đó';
}

function formatClockTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
  }).format(new Date(value));
}

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isPreviousLocalDay(candidate: Date, now: Date) {
  const yesterday = new Date(now);
  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameLocalDay(candidate, yesterday);
}
