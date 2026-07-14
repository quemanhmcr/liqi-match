import { describe, expect, it, jest } from '@jest/globals';

import {
  PersistedDeepLinkIntentStore,
  processPendingDeepLinkIntent,
  type DeepLinkIntentStorage,
  type NotificationDeepLinkResolver,
} from '@/app-shell/deep-link';
import {
  DeepLinkV1Schema,
  NotificationIdSchema,
  EventIdSchema,
} from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';

class MemoryStorage implements DeepLinkIntentStorage {
  readonly values = new Map<string, string>();
  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  async removeItem(key: string) {
    this.values.delete(key);
  }
  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const session: AuthSession = {
  accessToken: 'access-token',
  expiresAt: 4_000_000_000,
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  user: { id: '01000000-0000-4000-8000-000000000001' },
};
const notificationId = NotificationIdSchema.parse(
  '90000000-0000-4000-8000-000000000001',
);
const sourceEventId = EventIdSchema.parse(
  '80000000-0000-4000-8000-000000000001',
);

async function pendingStore() {
  const store = new PersistedDeepLinkIntentStore(new MemoryStorage());
  await store.enqueue({
    accountId: null,
    deepLink: DeepLinkV1Schema.parse({
      matchId: '50000000-0000-4000-8000-000000000001',
      target: 'match',
    }),
    enqueuedAt: '2026-07-14T08:00:00.000Z',
    expiresAt: '2026-07-21T08:00:00.000Z',
    intentId: `notification:${notificationId}`,
    notificationId,
    source: 'notification-response',
    sourceEventId,
  });
  return store;
}

function resolverWith(
  resolution: Awaited<ReturnType<NotificationDeepLinkResolver['resolve']>>,
) {
  const resolve = jest.fn<NotificationDeepLinkResolver['resolve']>();
  resolve.mockResolvedValue(resolution);
  return { resolve };
}

function navigation() {
  return { push: jest.fn(), replace: jest.fn() };
}

describe('processPendingDeepLinkIntent', () => {
  it('does not claim or navigate until a session is restored', async () => {
    const store = await pendingStore();
    const nav = navigation();
    const resolver = resolverWith({
      deepLink: null,
      notificationId,
      playerLifecycle: null,
      readAt: null,
      resolvedAt: '2026-07-14T08:01:00.000Z',
      status: 'not_found',
    });

    await expect(
      processPendingDeepLinkIntent({
        navigation: nav,
        resolver,
        session: null,
        store,
      }),
    ).resolves.toEqual({ kind: 'idle' });
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect((await store.peek())?.attempts).toBe(0);
  });

  it('uses the canonical server destination rather than the push payload route', async () => {
    const store = await pendingStore();
    const nav = navigation();
    const resolver = resolverWith({
      deepLink: DeepLinkV1Schema.parse({
        conversationId: '60000000-0000-4000-8000-000000000001',
        target: 'conversation',
      }),
      notificationId,
      playerLifecycle: 'active',
      readAt: '2026-07-14T08:01:00.000Z',
      resolvedAt: '2026-07-14T08:01:00.000Z',
      status: 'available',
    });

    await expect(
      processPendingDeepLinkIntent({
        navigation: nav,
        now: () => new Date('2026-07-14T08:01:00.000Z'),
        resolver,
        session,
        store,
      }),
    ).resolves.toMatchObject({ kind: 'navigated' });
    expect(nav.push).toHaveBeenCalledWith({
      params: { conversationId: '60000000-0000-4000-8000-000000000001' },
      pathname: '/messages/[conversationId]',
    });
    await expect(store.peek()).resolves.toBeNull();
  });

  it('releases event-ordering deferrals for a later retry', async () => {
    const store = await pendingStore();
    const resolver = resolverWith({
      deepLink: DeepLinkV1Schema.parse({
        conversationId: '60000000-0000-4000-8000-000000000001',
        target: 'conversation',
      }),
      notificationId,
      playerLifecycle: 'active',
      readAt: '2026-07-14T08:01:00.000Z',
      resolvedAt: '2026-07-14T08:01:00.000Z',
      status: 'defer_target',
    });

    await expect(
      processPendingDeepLinkIntent({
        navigation: navigation(),
        now: () => new Date('2026-07-14T08:01:00.000Z'),
        resolver,
        session,
        store,
      }),
    ).resolves.toEqual({
      intentId: `notification:${notificationId}`,
      kind: 'retry',
      retryAfterMs: 2_000,
    });
    expect((await store.peek())?.claimedAt).toBeNull();
  });

  it.each(['disabled', 'expired', 'not_found', 'player_unavailable'] as const)(
    'completes %s with a safe root fallback',
    async (status) => {
      const store = await pendingStore();
      const nav = navigation();
      const resolver = resolverWith({
        deepLink: null,
        notificationId,
        playerLifecycle:
          status === 'player_unavailable' ? 'suspended' : 'active',
        readAt: null,
        resolvedAt: '2026-07-14T08:01:00.000Z',
        status,
      });

      await expect(
        processPendingDeepLinkIntent({
          navigation: nav,
          now: () => new Date('2026-07-14T08:01:00.000Z'),
          resolver,
          session,
          store,
        }),
      ).resolves.toMatchObject({ kind: 'safe-fallback' });
      expect(nav.replace).toHaveBeenCalledWith('/home');
      await expect(store.peek()).resolves.toBeNull();
    },
  );

  it('releases the lease when the resolver fails transiently', async () => {
    const store = await pendingStore();
    const resolve = jest.fn<NotificationDeepLinkResolver['resolve']>();
    resolve.mockRejectedValue(new Error('network unavailable'));

    await expect(
      processPendingDeepLinkIntent({
        navigation: navigation(),
        now: () => new Date('2026-07-14T08:01:00.000Z'),
        resolver: { resolve },
        session,
        store,
      }),
    ).rejects.toThrow('network unavailable');
    expect((await store.peek())?.claimedAt).toBeNull();
  });
});
