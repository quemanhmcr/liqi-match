import { describe, expect, it } from '@jest/globals';

import {
  PersistedDeepLinkIntentStore,
  type DeepLinkIntentStorage,
} from '@/app-shell/deep-link';
import {
  DeepLinkV1Schema,
  NotificationIdSchema,
  EventIdSchema,
} from '@/shared/contracts/core-v1';

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

const intent = {
  accountId: null,
  deepLink: DeepLinkV1Schema.parse({
    matchId: '50000000-0000-4000-8000-000000000001',
    target: 'match',
  }),
  enqueuedAt: '2026-07-14T08:00:00.000Z',
  expiresAt: '2026-07-15T08:00:00.000Z',
  intentId: 'notification-response-1',
  notificationId: NotificationIdSchema.parse(
    '90000000-0000-4000-8000-000000000001',
  ),
  source: 'notification-response' as const,
  sourceEventId: EventIdSchema.parse('80000000-0000-4000-8000-000000000001'),
};

describe('PersistedDeepLinkIntentStore', () => {
  it('deduplicates the same notification response across cold-start and listener paths', async () => {
    const store = new PersistedDeepLinkIntentStore(new MemoryStorage());

    const first = await store.enqueue(intent);
    const second = await store.enqueue({
      ...intent,
      enqueuedAt: '2026-07-14T08:00:01.000Z',
    });

    expect(second).toEqual(first);
    expect((await store.peek())?.attempts).toBe(0);
  });

  it('leases a claim so concurrent coordinators cannot navigate twice', async () => {
    const store = new PersistedDeepLinkIntentStore(new MemoryStorage());
    await store.enqueue(intent);

    const [first, second] = await Promise.all([
      store.claim({
        leaseDurationMs: 30_000,
        now: '2026-07-14T08:01:00.000Z',
      }),
      store.claim({
        leaseDurationMs: 30_000,
        now: '2026-07-14T08:01:00.000Z',
      }),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect((first ?? second)?.attempts).toBe(1);
  });

  it('allows retry after release and removes only the matching completed intent', async () => {
    const store = new PersistedDeepLinkIntentStore(new MemoryStorage());
    await store.enqueue(intent);
    const claimed = await store.claim({
      leaseDurationMs: 30_000,
      now: '2026-07-14T08:01:00.000Z',
    });
    if (!claimed) throw new Error('Expected a claimed intent.');

    expect(await store.release(claimed.intentId)).toBe(true);
    expect(
      await store.claim({
        leaseDurationMs: 30_000,
        now: '2026-07-14T08:01:01.000Z',
      }),
    ).toMatchObject({ attempts: 2, claimedAt: '2026-07-14T08:01:01.000Z' });
    expect(await store.complete('other-intent')).toBe(false);
    expect(await store.complete(claimed.intentId)).toBe(true);
    expect(await store.peek()).toBeNull();
  });

  it('drops an expired pending intent instead of navigating stale state', async () => {
    const store = new PersistedDeepLinkIntentStore(new MemoryStorage());
    await store.enqueue(intent);

    await expect(
      store.claim({
        leaseDurationMs: 30_000,
        now: '2026-07-16T08:00:00.000Z',
      }),
    ).resolves.toBeNull();
    await expect(store.peek()).resolves.toBeNull();
  });

  it('recovers from corrupt persisted input without crashing app startup', async () => {
    const storage = new MemoryStorage();
    storage.values.set('@liqi/deep-link-intent/v1', '{broken-json');
    const store = new PersistedDeepLinkIntentStore(storage);

    await expect(store.peek()).resolves.toBeNull();
    expect(storage.values.size).toBe(0);
  });
});
