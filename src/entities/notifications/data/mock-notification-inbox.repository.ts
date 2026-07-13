import AsyncStorage from '@react-native-async-storage/async-storage';

import { goldenWorldAssetKeys, isAssetKey } from '@/entities/media-asset';

import {
  compareNotificationWatermarks,
  countUnseenNotifications,
  isAtOrBeforeNotificationWatermark,
  latestNotificationWatermark,
  type NotificationInboxPage,
  type NotificationInboxRepository,
  type NotificationInboxSummary,
  type NotificationRecord,
} from '../model/notification';

const MOCK_STORAGE_NAMESPACE = '@liqi-match/notification-inbox/mock-v3';
const MOCK_STORAGE_VERSION = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

type NotificationStorage = Pick<
  typeof AsyncStorage,
  'getItem' | 'removeItem' | 'setItem'
>;

type PersistedNotificationInbox = {
  items: NotificationRecord[];
  version: typeof MOCK_STORAGE_VERSION;
};

type MockNotificationInboxRepositoryOptions = {
  now?: () => Date;
  storage?: NotificationStorage;
};

export class MockNotificationInboxRepository implements NotificationInboxRepository {
  private readonly cache = new Map<string, PersistedNotificationInbox>();
  private readonly now: () => Date;
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly storage: NotificationStorage;

  constructor(options: MockNotificationInboxRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.storage = options.storage ?? AsyncStorage;
  }

  async getSummary({
    session,
    signal,
  }: Parameters<
    NotificationInboxRepository['getSummary']
  >[0]): Promise<NotificationInboxSummary> {
    return this.enqueue(session.user.id, async () => {
      throwIfAborted(signal);
      const state = await this.readState(session.user.id);
      throwIfAborted(signal);
      return summaryFromState(state, this.now());
    });
  }

  async list({
    cursor,
    limit,
    session,
    signal,
  }: Parameters<
    NotificationInboxRepository['list']
  >[0]): Promise<NotificationInboxPage> {
    return this.enqueue(session.user.id, async () => {
      throwIfAborted(signal);
      const state = await this.readState(session.user.id);
      throwIfAborted(signal);

      const offset = parseCursor(cursor);
      const pageSize = Math.min(
        Math.max(Math.floor(limit ?? DEFAULT_PAGE_SIZE), 1),
        MAX_PAGE_SIZE,
      );
      const items = sortNotifications(state.items).slice(
        offset,
        offset + pageSize,
      );
      const nextOffset = offset + items.length;

      return {
        items,
        nextCursor:
          nextOffset < state.items.length ? createCursor(nextOffset) : null,
        latestWatermark: latestNotificationWatermark(state.items),
        unseenCount: countUnseenNotifications(state.items),
      };
    });
  }

  async markSeenThrough({
    seenThrough,
    session,
    signal,
  }: Parameters<NotificationInboxRepository['markSeenThrough']>[0]) {
    return this.enqueue(session.user.id, async () => {
      throwIfAborted(signal);
      const state = await this.readState(session.user.id);
      const seenAt = this.now().toISOString();
      let changed = false;

      const items = state.items.map((notification) => {
        if (
          notification.seenAt ||
          !isAtOrBeforeNotificationWatermark(notification, seenThrough)
        ) {
          return notification;
        }

        changed = true;
        return { ...notification, seenAt } as NotificationRecord;
      });

      throwIfAborted(signal);
      if (changed) await this.writeState(session.user.id, { ...state, items });

      return {
        seenAt,
        seenThrough,
        unseenCount: countUnseenNotifications(items),
      };
    });
  }

  async markRead({
    notificationId,
    session,
    signal,
  }: Parameters<NotificationInboxRepository['markRead']>[0]) {
    return this.enqueue(session.user.id, async () => {
      throwIfAborted(signal);
      const state = await this.readState(session.user.id);
      const readAt = this.now().toISOString();
      let selected: NotificationRecord | undefined;
      let changed = false;

      const items = state.items.map((notification) => {
        if (notification.id !== notificationId) return notification;

        if (notification.readAt && notification.seenAt) {
          selected = notification;
          return notification;
        }

        changed = true;
        selected = {
          ...notification,
          readAt: notification.readAt ?? readAt,
          seenAt: notification.seenAt ?? readAt,
        } as NotificationRecord;
        return selected;
      });

      if (!selected) {
        throw new NotificationNotFoundError(notificationId);
      }

      throwIfAborted(signal);
      if (changed) await this.writeState(session.user.id, { ...state, items });

      return {
        notification: selected,
        unseenCount: countUnseenNotifications(items),
      };
    });
  }

  async resetForTesting(userId: string) {
    await this.queues.get(userId)?.catch(() => undefined);
    this.queues.delete(userId);
    this.cache.delete(userId);
    await this.storage.removeItem(storageKey(userId));
  }

  private enqueue<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(userId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.queues.set(userId, current);

    return current.finally(() => {
      if (this.queues.get(userId) === current) this.queues.delete(userId);
    });
  }

  private async readState(userId: string): Promise<PersistedNotificationInbox> {
    const cached = this.cache.get(userId);
    if (cached) return cached;

    const raw = await this.storage.getItem(storageKey(userId));
    const restored = parsePersistedState(raw, userId);
    if (restored) {
      this.cache.set(userId, restored);
      return restored;
    }

    const initialState: PersistedNotificationInbox = {
      items: createMockNotificationSeed(userId, this.now()),
      version: MOCK_STORAGE_VERSION,
    };
    await this.writeState(userId, initialState);
    return initialState;
  }

  private async writeState(userId: string, state: PersistedNotificationInbox) {
    await this.storage.setItem(storageKey(userId), JSON.stringify(state));
    this.cache.set(userId, state);
  }
}

export class NotificationNotFoundError extends Error {
  constructor(readonly notificationId: string) {
    super(`Notification not found: ${notificationId}`);
    this.name = 'NotificationNotFoundError';
  }
}

export const mockNotificationInboxRepository =
  new MockNotificationInboxRepository();

export async function resetMockNotificationInboxForTesting(userId: string) {
  await mockNotificationInboxRepository.resetForTesting(userId);
}

export function createMockNotificationSeed(
  recipientId: string,
  now: Date,
): NotificationRecord[] {
  const occurredAt = (minutesAgo: number) =>
    new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  const readTimestamp = (minutesAgo: number) =>
    new Date(
      now.getTime() - Math.max(minutesAgo - 1, 0) * 60_000,
    ).toISOString();
  const minhAnh = {
    avatarAssetKey: goldenWorldAssetKeys.profiles.minhAnhAvatar,
    displayName: 'Minh Anh',
    id: 'profile-minh-anh',
  } as const;
  const khoaJungle = {
    avatarAssetKey: goldenWorldAssetKeys.profiles.khoaJungleAvatar,
    displayName: 'Khoa Jungle',
    id: 'profile-khoa-jungle',
  } as const;

  return sortNotifications([
    {
      id: 'invite-team-sao-bang',
      kind: 'set-invite',
      occurredAt: occurredAt(2),
      payload: {
        actor: minhAnh,
        setId: 'set-team-sao-bang',
        setName: 'Team Sao Băng',
      },
      readAt: null,
      recipientId,
      seenAt: null,
    },
    {
      id: 'message-khoa-jungle',
      kind: 'direct-message',
      occurredAt: occurredAt(12),
      payload: {
        actor: khoaJungle,
        conversationId: 'conversation-khoa-jungle',
        excerpt: 'Đang thiếu Mid, vào không?',
      },
      readAt: null,
      recipientId,
      seenAt: null,
    },
    {
      id: 'praise-teammates',
      kind: 'praise-received',
      occurredAt: occurredAt(35),
      payload: {
        actors: [
          minhAnh,
          {
            avatarAssetKey: goldenWorldAssetKeys.library.avatars.cyberGirl,
            displayName: 'Linh Mid',
            id: 'profile-linh-mid',
          },
          {
            avatarAssetKey: goldenWorldAssetKeys.library.avatars.pinkCarry,
            displayName: 'Vy Carry',
            id: 'profile-vy-carry',
          },
        ],
        count: 2,
      },
      readAt: null,
      recipientId,
      seenAt: null,
    },
    {
      id: 'team-rank-starting',
      kind: 'team-event',
      occurredAt: occurredAt(60),
      payload: {
        startsAt: new Date(now.getTime() + 4 * 60 * 60_000).toISOString(),
        teamId: 'team-rank',
        teamName: 'Team Rank',
      },
      readAt: readTimestamp(60),
      recipientId,
      seenAt: readTimestamp(60),
    },
    {
      id: 'aya-liked-profile',
      kind: 'profile-liked',
      occurredAt: occurredAt(120),
      payload: {
        actor: {
          avatarAssetKey: goldenWorldAssetKeys.library.avatars.pinkSupport,
          displayName: 'Aya Only',
          id: 'profile-aya-only',
        },
        profileId: 'profile-aya-only',
      },
      readAt: readTimestamp(120),
      recipientId,
      seenAt: readTimestamp(120),
    },
    {
      id: 'weekly-mission-reward',
      kind: 'weekly-reward',
      occurredAt: occurredAt(26 * 60),
      payload: { amount: 50, currency: 'diamond' },
      readAt: readTimestamp(26 * 60),
      recipientId,
      seenAt: readTimestamp(26 * 60),
    },
    {
      id: 'reputation-updated',
      kind: 'reputation-changed',
      occurredAt: occurredAt(30 * 60),
      payload: { score: 98 },
      readAt: readTimestamp(30 * 60),
      recipientId,
      seenAt: readTimestamp(30 * 60),
    },
  ]);
}

function summaryFromState(
  state: PersistedNotificationInbox,
  now: Date,
): NotificationInboxSummary {
  return {
    latestWatermark: latestNotificationWatermark(state.items),
    unseenCount: countUnseenNotifications(state.items),
    updatedAt: now.toISOString(),
  };
}

function sortNotifications(
  notifications: readonly NotificationRecord[],
): NotificationRecord[] {
  return [...notifications].sort((left, right) =>
    compareNotificationWatermarks(
      { id: right.id, occurredAt: right.occurredAt },
      { id: left.id, occurredAt: left.occurredAt },
    ),
  );
}

function storageKey(userId: string) {
  return `${MOCK_STORAGE_NAMESPACE}:${encodeURIComponent(userId)}`;
}

function parsePersistedState(
  raw: string | null,
  userId: string,
): PersistedNotificationInbox | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedNotificationInbox>;
    if (
      parsed.version !== MOCK_STORAGE_VERSION ||
      !Array.isArray(parsed.items)
    ) {
      return null;
    }

    const items = parsed.items.filter(
      (item): item is NotificationRecord =>
        isNotificationRecord(item) && item.recipientId === userId,
    );
    if (items.length !== parsed.items.length) return null;

    return { items: sortNotifications(items), version: MOCK_STORAGE_VERSION };
  } catch {
    return null;
  }
}

function isNotificationRecord(value: unknown): value is NotificationRecord {
  if (!isRecord(value)) return false;
  const item = value;
  if (
    !isNonEmptyString(item.id) ||
    !isNonEmptyString(item.kind) ||
    !isTimestamp(item.occurredAt) ||
    !isNonEmptyString(item.recipientId) ||
    !isNullableTimestamp(item.readAt) ||
    !isNullableTimestamp(item.seenAt) ||
    !isRecord(item.payload)
  ) {
    return false;
  }

  const payload = item.payload;
  switch (item.kind) {
    case 'set-invite':
      return (
        isNotificationActor(payload.actor) &&
        isNonEmptyString(payload.setId) &&
        isNonEmptyString(payload.setName)
      );
    case 'direct-message':
      return (
        isNotificationActor(payload.actor) &&
        isNonEmptyString(payload.conversationId) &&
        typeof payload.excerpt === 'string'
      );
    case 'praise-received':
      return (
        Array.isArray(payload.actors) &&
        payload.actors.every(isNotificationActor) &&
        isNonNegativeNumber(payload.count)
      );
    case 'team-event':
      return (
        isTimestamp(payload.startsAt) &&
        isNonEmptyString(payload.teamId) &&
        isNonEmptyString(payload.teamName)
      );
    case 'profile-liked':
      return (
        isNotificationActor(payload.actor) &&
        isNonEmptyString(payload.profileId)
      );
    case 'weekly-reward':
      return (
        isNonNegativeNumber(payload.amount) && payload.currency === 'diamond'
      );
    case 'reputation-changed':
      return isNonNegativeNumber(payload.score);
    default:
      return false;
  }
}

function isNotificationActor(value: unknown) {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.displayName) &&
    (value.avatarAssetKey === undefined ||
      (typeof value.avatarAssetKey === 'string' &&
        isAssetKey(value.avatarAssetKey))) &&
    (value.avatarUrl === undefined || typeof value.avatarUrl === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function createCursor(offset: number) {
  return `offset:${offset}`;
}

function parseCursor(cursor?: string) {
  if (!cursor) return 0;
  const match = /^offset:(\d+)$/.exec(cursor);
  return match ? Number(match[1]) : 0;
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error('Notification request was aborted.');
  error.name = 'AbortError';
  throw error;
}
