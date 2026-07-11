import type { ImageSourcePropType } from 'react-native';

import {
  notificationCategory,
  type NotificationRecord,
} from '@/entities/notifications';

import { notificationActorImageSource } from '../data/notification.fixture';

export type NotificationTone = 'blue' | 'cyan' | 'pink' | 'purple';

export type NotificationAction = {
  label: string;
  tone: Extract<NotificationTone, 'blue' | 'pink' | 'purple'>;
};

export type NotificationVisual =
  | {
      badgeIcon?: string;
      kind: 'avatar';
      source: ImageSourcePropType;
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
  category: ReturnType<typeof notificationCategory>;
  group: 'Hôm nay' | 'Trước đó';
  id: string;
  isSeen: boolean;
  messageParts: readonly string[];
  previewAvatars?: readonly ImageSourcePropType[];
  reward?: NotificationReward;
  timeLabel: string;
  title: string;
  visual: NotificationVisual;
};

export function mapNotificationToViewModel(
  notification: NotificationRecord,
  now = new Date(),
): NotificationItem {
  const shared = {
    category: notificationCategory(notification),
    group: notificationGroup(notification.occurredAt, now),
    id: notification.id,
    isSeen: Boolean(notification.seenAt),
    timeLabel: formatNotificationTime(notification.occurredAt, now),
  } as const;

  switch (notification.kind) {
    case 'set-invite': {
      const source = notificationActorImageSource(notification.payload.actor);
      return {
        ...shared,
        action: { label: 'Xem set', tone: 'pink' },
        messageParts: [
          'đã mời bạn vào set',
          `“${notification.payload.setName}”`,
        ],
        title: notification.payload.actor.displayName,
        visual: source
          ? {
              badgeIcon: 'sparkles-outline',
              kind: 'avatar',
              source,
              tone: 'purple',
            }
          : { icon: 'people-outline', kind: 'symbol', tone: 'purple' },
      };
    }
    case 'direct-message': {
      const source = notificationActorImageSource(notification.payload.actor);
      return {
        ...shared,
        action: { label: 'Trả lời', tone: 'blue' },
        messageParts: ['đã nhắn cho bạn', `“${notification.payload.excerpt}”`],
        title: notification.payload.actor.displayName,
        visual: source
          ? {
              badgeIcon: 'chatbubble-ellipses-outline',
              kind: 'avatar',
              source,
              tone: 'blue',
            }
          : { icon: 'chatbubble-outline', kind: 'symbol', tone: 'blue' },
      };
    }
    case 'praise-received': {
      const previewAvatars = notification.payload.actors
        .map(notificationActorImageSource)
        .filter((source): source is ImageSourcePropType => Boolean(source));
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
        action: { label: 'Tham gia', tone: 'purple' },
        messageParts: [
          'tối nay bắt đầu',
          `lúc ${formatClockTime(notification.payload.startsAt)}`,
        ],
        title: notification.payload.teamName,
        visual: { icon: 'trophy-outline', kind: 'symbol', tone: 'purple' },
      };
    case 'profile-liked': {
      const source = notificationActorImageSource(notification.payload.actor);
      return {
        ...shared,
        messageParts: ['vừa thích hồ sơ của bạn'],
        reward: { icon: 'heart', label: '', tone: 'pink' },
        title: notification.payload.actor.displayName,
        visual: source
          ? { kind: 'avatar', source, tone: 'pink' }
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
