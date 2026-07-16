import { describe, expect, it, jest } from '@jest/globals';

import {
  NotificationResponseBridge,
  PersistedDeepLinkIntentStore,
  type DeepLinkIntentStorage,
  type NotificationResponseLike,
  type NotificationResponseSource,
} from '@/app-shell/deep-link';

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

function response(
  data: unknown,
  identifier = 'native-notification-request-1',
): NotificationResponseLike {
  return {
    notification: { request: { content: { data }, identifier } },
  };
}

const payload = {
  contractVersion: 1,
  deepLink: {
    conversationId: '60000000-0000-4000-8000-000000000001',
    target: 'conversation',
  },
  notificationId: '90000000-0000-4000-8000-000000000001',
  sourceEventId: '80000000-0000-4000-8000-000000000001',
};

function sourceWith(lastResponse: NotificationResponseLike | null) {
  let listener: ((value: NotificationResponseLike) => void) | null = null;
  const remove = jest.fn();
  const clearLastResponse = jest.fn<() => Promise<void>>();
  clearLastResponse.mockResolvedValue();
  const source: NotificationResponseSource = {
    addResponseListener: (next) => {
      listener = next;
      return { remove };
    },
    clearLastResponse,
    getLastResponse: async () => lastResponse,
  };
  return {
    clearLastResponse,
    emit: (value: NotificationResponseLike) => listener?.(value),
    remove,
    source,
  };
}

describe('NotificationResponseBridge', () => {
  it('restores, persists and clears a cold-start response', async () => {
    const storage = new MemoryStorage();
    const store = new PersistedDeepLinkIntentStore(storage);
    const source = sourceWith(response(payload));
    const onIntentEnqueued = jest.fn();
    const bridge = new NotificationResponseBridge({
      clock: () => new Date('2026-07-14T08:00:00.000Z'),
      onIntentEnqueued,
      source: source.source,
      store,
    });

    await bridge.start();

    await expect(store.peek()).resolves.toMatchObject({
      deepLink: payload.deepLink,
      expiresAt: '2026-07-21T08:00:00.000Z',
      intentId: `notification:${payload.notificationId}`,
      source: 'notification-response',
    });
    expect(source.clearLastResponse).toHaveBeenCalledTimes(1);
    expect(onIntentEnqueued).toHaveBeenCalledTimes(1);
  });

  it('persists an exact post-session feedback target from a cold-start response', async () => {
    const activityPayload = {
      ...payload,
      deepLink: {
        sessionId: '42000000-0000-4000-8000-000000000001',
        target: 'session_feedback' as const,
      },
      notificationId: '90000000-0000-4000-8000-000000000010',
      sourceEventId: '80000000-0000-4000-8000-000000000010',
    };
    const store = new PersistedDeepLinkIntentStore(new MemoryStorage());
    const source = sourceWith(response(activityPayload));
    const bridge = new NotificationResponseBridge({
      source: source.source,
      store,
    });

    await bridge.start();

    await expect(store.peek()).resolves.toMatchObject({
      deepLink: activityPayload.deepLink,
      intentId: `notification:${activityPayload.notificationId}`,
    });
    expect(source.clearLastResponse).toHaveBeenCalledTimes(1);
  });

  it('deduplicates cold-start and live listener delivery of the same notification', async () => {
    const store = new PersistedDeepLinkIntentStore(new MemoryStorage());
    const source = sourceWith(response(payload));
    const onIntentEnqueued = jest.fn();
    const bridge = new NotificationResponseBridge({
      clock: () => new Date('2026-07-14T08:00:00.000Z'),
      onIntentEnqueued,
      source: source.source,
      store,
    });

    await bridge.start();
    source.emit(response(payload));
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(store.peek()).resolves.toMatchObject({ attempts: 0 });
    expect(onIntentEnqueued).toHaveBeenCalledTimes(2);
  });

  it('clears an invalid cold-start response and logs without crashing startup', async () => {
    const store = new PersistedDeepLinkIntentStore(new MemoryStorage());
    const source = sourceWith(response({ deepLink: { target: 'unknown' } }));
    const error = jest.fn();
    const bridge = new NotificationResponseBridge({
      logger: { error },
      source: source.source,
      store,
    });

    await expect(bridge.start()).resolves.toBeUndefined();
    await expect(store.peek()).resolves.toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(source.clearLastResponse).toHaveBeenCalledTimes(1);
  });

  it('removes the live listener on stop', async () => {
    const source = sourceWith(null);
    const bridge = new NotificationResponseBridge({
      source: source.source,
      store: new PersistedDeepLinkIntentStore(new MemoryStorage()),
    });

    await bridge.start();
    bridge.stop();

    expect(source.remove).toHaveBeenCalledTimes(1);
  });
});
