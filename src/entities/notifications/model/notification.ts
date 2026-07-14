import type { AssetKey } from '@/entities/media-asset';
import type { AuthSession } from '@/shared/auth/auth-service';
import type { DeepLinkV1 } from '@/shared/contracts/core-v1';

export type NotificationCategory =
  'interaction' | 'message' | 'set-invite' | 'system';

export type NotificationActor = {
  avatarAssetKey?: AssetKey;
  avatarUrl?: string;
  displayName: string;
  id: string;
};

export type SetInviteNotification = NotificationBase<
  'set-invite',
  {
    actor: NotificationActor;
    setId: string;
    setName: string;
  }
>;

export type DirectMessageNotification = NotificationBase<
  'direct-message',
  {
    actor: NotificationActor;
    conversationId: string;
    excerpt: string;
  }
>;

export type SetInviteReceivedNotification = NotificationBase<
  'set-invite-received',
  { setId: string }
>;

export type MessageReceivedNotification = NotificationBase<
  'message-received',
  { conversationId: string }
>;

export type MatchCreatedNotification = NotificationBase<
  'match-created',
  { matchId: string }
>;

export type JoinRequestNotification = NotificationBase<
  'join-request',
  { setId: string }
>;

export type SystemNotification = NotificationBase<
  'system',
  { deepLink: DeepLinkV1 }
>;

export type PraiseReceivedNotification = NotificationBase<
  'praise-received',
  {
    actors: readonly NotificationActor[];
    count: number;
  }
>;

export type TeamEventNotification = NotificationBase<
  'team-event',
  {
    startsAt: string;
    teamId: string;
    teamName: string;
  }
>;

export type ProfileLikedNotification = NotificationBase<
  'profile-liked',
  {
    actor: NotificationActor;
    profileId: string;
  }
>;

export type WeeklyRewardNotification = NotificationBase<
  'weekly-reward',
  {
    amount: number;
    currency: 'diamond';
  }
>;

export type ReputationChangedNotification = NotificationBase<
  'reputation-changed',
  { score: number }
>;

export type NotificationRecord =
  | SetInviteNotification
  | DirectMessageNotification
  | SetInviteReceivedNotification
  | MessageReceivedNotification
  | MatchCreatedNotification
  | JoinRequestNotification
  | SystemNotification
  | PraiseReceivedNotification
  | TeamEventNotification
  | ProfileLikedNotification
  | WeeklyRewardNotification
  | ReputationChangedNotification;

export type NotificationKind = NotificationRecord['kind'];

export type NotificationSeenWatermark = {
  id: string;
  occurredAt: string;
};

export type NotificationInboxPage = {
  items: readonly NotificationRecord[];
  nextCursor: string | null;
  latestWatermark: NotificationSeenWatermark | null;
  unseenCount: number;
};

export type NotificationInboxSummary = {
  latestWatermark: NotificationSeenWatermark | null;
  unseenCount: number;
  updatedAt: string;
};

export type MarkNotificationsSeenResult = {
  seenAt: string;
  seenThrough: NotificationSeenWatermark;
  unseenCount: number;
};

export type MarkNotificationReadResult = {
  notification: NotificationRecord;
  unseenCount: number;
};

export type ListNotificationInboxInput = {
  cursor?: string;
  limit?: number;
  session: AuthSession;
  signal?: AbortSignal;
};

export type GetNotificationInboxSummaryInput = {
  session: AuthSession;
  signal?: AbortSignal;
};

export type MarkNotificationsSeenInput = {
  seenThrough: NotificationSeenWatermark;
  session: AuthSession;
  signal?: AbortSignal;
};

export type MarkNotificationReadInput = {
  notificationId: string;
  session: AuthSession;
  signal?: AbortSignal;
};

export interface NotificationInboxRepository {
  getSummary(
    input: GetNotificationInboxSummaryInput,
  ): Promise<NotificationInboxSummary>;
  list(input: ListNotificationInboxInput): Promise<NotificationInboxPage>;
  markRead(
    input: MarkNotificationReadInput,
  ): Promise<MarkNotificationReadResult>;
  markSeenThrough(
    input: MarkNotificationsSeenInput,
  ): Promise<MarkNotificationsSeenResult>;
}

type NotificationBase<
  TKind extends string,
  TPayload extends Record<string, unknown>,
> = {
  id: string;
  kind: TKind;
  occurredAt: string;
  payload: TPayload;
  readAt: string | null;
  recipientId: string;
  seenAt: string | null;
};

const categoryByKind: Record<NotificationKind, NotificationCategory> = {
  'direct-message': 'message',
  'message-received': 'message',
  'join-request': 'set-invite',
  'match-created': 'interaction',
  'praise-received': 'interaction',
  'profile-liked': 'interaction',
  'reputation-changed': 'system',
  'set-invite': 'set-invite',
  'set-invite-received': 'set-invite',
  system: 'system',
  'team-event': 'set-invite',
  'weekly-reward': 'system',
};

export function notificationCategory(
  notification: Pick<NotificationRecord, 'kind'>,
): NotificationCategory {
  return categoryByKind[notification.kind];
}

export function notificationWatermark(
  notification: Pick<NotificationRecord, 'id' | 'occurredAt'>,
): NotificationSeenWatermark {
  return { id: notification.id, occurredAt: notification.occurredAt };
}

export function compareNotificationWatermarks(
  left: NotificationSeenWatermark,
  right: NotificationSeenWatermark,
) {
  const occurredAtComparison = left.occurredAt.localeCompare(right.occurredAt);
  if (occurredAtComparison !== 0) return occurredAtComparison;
  return left.id.localeCompare(right.id);
}

export function isAtOrBeforeNotificationWatermark(
  notification: Pick<NotificationRecord, 'id' | 'occurredAt'>,
  watermark: NotificationSeenWatermark,
) {
  return (
    compareNotificationWatermarks(
      notificationWatermark(notification),
      watermark,
    ) <= 0
  );
}

export function latestNotificationWatermark(
  notifications: readonly Pick<NotificationRecord, 'id' | 'occurredAt'>[],
): NotificationSeenWatermark | null {
  return notifications.reduce<NotificationSeenWatermark | null>(
    (latest, notification) => {
      const candidate = notificationWatermark(notification);
      if (!latest || compareNotificationWatermarks(candidate, latest) > 0) {
        return candidate;
      }
      return latest;
    },
    null,
  );
}

export function countUnseenNotifications(
  notifications: readonly Pick<NotificationRecord, 'seenAt'>[],
) {
  return notifications.reduce(
    (count, notification) => count + (notification.seenAt ? 0 : 1),
    0,
  );
}
