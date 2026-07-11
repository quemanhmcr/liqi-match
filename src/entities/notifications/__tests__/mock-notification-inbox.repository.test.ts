import { describe, expect, it } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';

import { MockNotificationInboxRepository } from '../data/mock-notification-inbox.repository';

const fixedNow = new Date('2026-07-11T09:00:00.000Z');

function session(userId: string): AuthSession {
  return {
    accessToken: `access-${userId}`,
    expiresAt: 4102444800,
    refreshToken: `refresh-${userId}`,
    tokenType: 'bearer',
    user: { id: userId },
  };
}

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    removeItem: async (key: string) => {
      values.delete(key);
    },
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('MockNotificationInboxRepository', () => {
  it('exposes the same paginated contract a backend adapter will implement', async () => {
    const repository = new MockNotificationInboxRepository({
      now: () => fixedNow,
      storage: createMemoryStorage(),
    });

    const page = await repository.list({
      limit: 3,
      session: session('user-a'),
    });
    const summary = await repository.getSummary({ session: session('user-a') });

    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBe('offset:3');
    expect(page.latestWatermark).toEqual({
      id: 'invite-team-sao-bang',
      occurredAt: '2026-07-11T08:58:00.000Z',
    });
    expect(page.unseenCount).toBe(3);
    expect(summary.unseenCount).toBe(3);
  });

  it('rejects malformed persisted records and rebuilds a valid inbox', async () => {
    let persisted = JSON.stringify({
      items: [
        {
          id: 'unknown-record',
          kind: 'future-kind',
          occurredAt: fixedNow.toISOString(),
          payload: {},
          readAt: null,
          recipientId: 'user-a',
          seenAt: null,
        },
      ],
      version: 1,
    });
    const repository = new MockNotificationInboxRepository({
      now: () => fixedNow,
      storage: {
        getItem: async () => persisted,
        removeItem: async () => {
          persisted = '';
        },
        setItem: async (_key, value) => {
          persisted = value;
        },
      },
    });

    const page = await repository.list({ session: session('user-a') });

    expect(page.items).toHaveLength(7);
    expect(page.items.some((item) => item.id === 'unknown-record')).toBe(false);
    expect(JSON.parse(persisted).items).toHaveLength(7);
  });

  it('isolates persisted seen state by authenticated user', async () => {
    const repository = new MockNotificationInboxRepository({
      now: () => fixedNow,
      storage: createMemoryStorage(),
    });
    const userA = session('user-a');
    const userB = session('user-b');
    const userAPage = await repository.list({ session: userA });

    await repository.markSeenThrough({
      seenThrough: userAPage.latestWatermark!,
      session: userA,
    });

    expect((await repository.getSummary({ session: userA })).unseenCount).toBe(
      0,
    );
    expect((await repository.getSummary({ session: userB })).unseenCount).toBe(
      3,
    );
  });

  it('marks only notifications at or before the requested watermark', async () => {
    const repository = new MockNotificationInboxRepository({
      now: () => fixedNow,
      storage: createMemoryStorage(),
    });
    const currentSession = session('user-a');
    const page = await repository.list({ session: currentSession });
    const secondNewest = page.items[1]!;

    const result = await repository.markSeenThrough({
      seenThrough: {
        id: secondNewest.id,
        occurredAt: secondNewest.occurredAt,
      },
      session: currentSession,
    });
    const updated = await repository.list({ session: currentSession });

    expect(result.unseenCount).toBe(1);
    expect(updated.items[0]?.seenAt).toBeNull();
    expect(updated.items[1]?.seenAt).not.toBeNull();
    expect(updated.items[2]?.seenAt).not.toBeNull();
  });

  it('persists state across repository instances using the same storage', async () => {
    const storage = createMemoryStorage();
    const currentSession = session('user-a');
    const firstRepository = new MockNotificationInboxRepository({
      now: () => fixedNow,
      storage,
    });
    const page = await firstRepository.list({ session: currentSession });

    await firstRepository.markSeenThrough({
      seenThrough: page.latestWatermark!,
      session: currentSession,
    });

    const restoredRepository = new MockNotificationInboxRepository({
      now: () => fixedNow,
      storage,
    });
    expect(
      (await restoredRepository.getSummary({ session: currentSession }))
        .unseenCount,
    ).toBe(0);
  });

  it('does not poison the runtime cache when persistence fails', async () => {
    const values = new Map<string, string>();
    let rejectWrites = false;
    const repository = new MockNotificationInboxRepository({
      now: () => fixedNow,
      storage: {
        getItem: async (key) => values.get(key) ?? null,
        removeItem: async (key) => {
          values.delete(key);
        },
        setItem: async (key, value) => {
          if (rejectWrites) throw new Error('storage unavailable');
          values.set(key, value);
        },
      },
    });
    const currentSession = session('user-a');
    const page = await repository.list({ session: currentSession });
    rejectWrites = true;

    await expect(
      repository.markSeenThrough({
        seenThrough: page.latestWatermark!,
        session: currentSession,
      }),
    ).rejects.toThrow('storage unavailable');

    expect(
      (await repository.getSummary({ session: currentSession })).unseenCount,
    ).toBe(3);
  });

  it('marks one item read idempotently and read implies seen', async () => {
    const repository = new MockNotificationInboxRepository({
      now: () => fixedNow,
      storage: createMemoryStorage(),
    });
    const currentSession = session('user-a');

    const first = await repository.markRead({
      notificationId: 'message-khoa-jungle',
      session: currentSession,
    });
    const second = await repository.markRead({
      notificationId: 'message-khoa-jungle',
      session: currentSession,
    });

    expect(first.unseenCount).toBe(2);
    expect(first.notification.readAt).not.toBeNull();
    expect(first.notification.seenAt).toBe(first.notification.readAt);
    expect(second.notification.readAt).toBe(first.notification.readAt);
    expect(second.unseenCount).toBe(2);
  });
});
