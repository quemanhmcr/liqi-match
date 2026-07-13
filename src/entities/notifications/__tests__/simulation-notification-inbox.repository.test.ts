import { describe, expect, it } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import { createSimulationRuntime } from '@/shared/simulation';
import {
  compareNotificationWatermarks,
  countUnseenNotifications,
  isAtOrBeforeNotificationWatermark,
  latestNotificationWatermark,
  type NotificationRecord,
} from '../model/notification';
import {
  createSimulationNotificationInboxRepository,
  partialSimulationItems,
  SIMULATION_NOTIFICATION_OPERATIONS,
  type SimulationNotificationLens,
} from '../data/simulation-notification-inbox.repository';

type TestWorld = { notifications: NotificationRecord[] };

const userA = session('user-a');

function createHarness(namespace: string) {
  const runtime = createSimulationRuntime<TestWorld>({
    initialScenarioId: 'golden',
    namespace,
    scenarios: [
      {
        clock: { at: '2026-07-13T10:00:00.000Z' },
        id: 'golden',
        world: { notifications: seed() },
      },
    ],
  });
  const lens: SimulationNotificationLens<TestWorld> = {
    getSummary: (world, input, context) => {
      const items = forUser(world.notifications, input.session.user.id);
      return {
        latestWatermark: latestNotificationWatermark(items),
        unseenCount: countUnseenNotifications(items),
        updatedAt: context.clock.now().toISOString(),
      };
    },
    list: (world, input, context) => {
      const all = forUser(world.notifications, input.session.user.id);
      const offset = input.cursor ? Number(input.cursor.split(':')[1] ?? 0) : 0;
      const limit = input.limit ?? 20;
      const page = partialSimulationItems(
        all.slice(offset, offset + limit),
        context,
      );
      return {
        items: page,
        latestWatermark: latestNotificationWatermark(all),
        nextCursor:
          offset + page.length < all.length
            ? `offset:${offset + page.length}`
            : null,
        unseenCount: countUnseenNotifications(all),
      };
    },
    markRead: (world, input, context) => {
      const item = world.notifications.find(
        (notification) =>
          notification.id === input.notificationId &&
          notification.recipientId === input.session.user.id,
      );
      if (!item) throw new Error('Notification not found.');
      const readAt = context.clock.now().toISOString();
      item.readAt ??= readAt;
      item.seenAt ??= readAt;
      return {
        notification: { ...item } as NotificationRecord,
        unseenCount: countUnseenNotifications(
          forUser(world.notifications, input.session.user.id),
        ),
      };
    },
    markSeenThrough: (world, input, context) => {
      const seenAt = context.clock.now().toISOString();
      const items = forUser(world.notifications, input.session.user.id);
      for (const item of items) {
        if (
          !item.seenAt &&
          isAtOrBeforeNotificationWatermark(item, input.seenThrough)
        ) {
          item.seenAt = seenAt;
        }
      }
      return {
        seenAt,
        seenThrough: input.seenThrough,
        unseenCount: countUnseenNotifications(items),
      };
    },
  };
  return {
    repository: createSimulationNotificationInboxRepository({ lens, runtime }),
    runtime,
  };
}

describe('SimulationNotificationInboxRepository', () => {
  it('uses one world and deterministic clock for list, seen and read mutations', async () => {
    const { repository, runtime } = createHarness('notifications-mutations');
    const page = await repository.list({ session: userA });

    expect(page.items.map((item) => item.id)).toEqual([
      'notification-new',
      'notification-old',
    ]);
    expect(page.unseenCount).toBe(2);

    await repository.markSeenThrough({
      seenThrough: {
        id: page.items[1]!.id,
        occurredAt: page.items[1]!.occurredAt,
      },
      session: userA,
    });
    expect((await repository.getSummary({ session: userA })).unseenCount).toBe(
      1,
    );

    runtime.advanceClock(60_000);
    const read = await repository.markRead({
      notificationId: 'notification-new',
      session: userA,
    });
    expect(read.notification.readAt).toBe('2026-07-13T10:01:00.000Z');
    expect(read.unseenCount).toBe(0);
  });

  it('resets and restores notification mutations with the world snapshot', async () => {
    const { repository, runtime } = createHarness('notifications-snapshot');
    const page = await repository.list({ session: userA });
    const snapshot = await runtime.snapshot();

    await repository.markSeenThrough({
      seenThrough: page.latestWatermark!,
      session: userA,
    });
    expect((await repository.getSummary({ session: userA })).unseenCount).toBe(
      0,
    );

    await runtime.restore(snapshot);
    expect((await repository.getSummary({ session: userA })).unseenCount).toBe(
      2,
    );

    await runtime.reset();
    expect((await repository.getSummary({ session: userA })).unseenCount).toBe(
      2,
    );
  });

  it('maps shared faults and forwards partial response directives to the lens', async () => {
    const { repository, runtime } = createHarness('notifications-faults');
    runtime.failNext({
      kind: 'partial_response',
      limit: 1,
      operation: SIMULATION_NOTIFICATION_OPERATIONS.list,
      scope: userA.user.id,
    });
    const partial = await repository.list({ session: userA });
    expect(partial.items).toHaveLength(1);
    expect(partial.unseenCount).toBe(2);

    runtime.setNetwork('offline');
    await expect(repository.getSummary({ session: userA })).rejects.toEqual(
      expect.objectContaining({
        code: 'network_error',
        retryable: true,
      }),
    );

    runtime.setNetwork('online');
    runtime.failNext({
      kind: 'storage_failure',
      operation: SIMULATION_NOTIFICATION_OPERATIONS.markRead,
      scope: 'notification-new',
    });
    await expect(
      repository.markRead({
        notificationId: 'notification-new',
        session: userA,
      }),
    ).rejects.toMatchObject({ code: 'storage_error', retryable: true });
  });
});

function seed(): NotificationRecord[] {
  return [
    {
      id: 'notification-new',
      kind: 'direct-message',
      occurredAt: '2026-07-13T09:55:00.000Z',
      payload: {
        actor: { displayName: 'Minh Anh', id: 'profile-minh-anh' },
        conversationId: 'conversation-1',
        excerpt: 'Vào trận không?',
      },
      readAt: null,
      recipientId: 'user-a',
      seenAt: null,
    },
    {
      id: 'notification-old',
      kind: 'profile-liked',
      occurredAt: '2026-07-13T09:50:00.000Z',
      payload: {
        actor: { displayName: 'Khoa', id: 'profile-khoa' },
        profileId: 'profile-khoa',
      },
      readAt: null,
      recipientId: 'user-a',
      seenAt: null,
    },
    {
      id: 'notification-other-user',
      kind: 'weekly-reward',
      occurredAt: '2026-07-13T09:59:00.000Z',
      payload: { amount: 50, currency: 'diamond' },
      readAt: null,
      recipientId: 'user-b',
      seenAt: null,
    },
  ];
}

function forUser(items: readonly NotificationRecord[], userId: string) {
  return items
    .filter((item) => item.recipientId === userId)
    .sort((left, right) =>
      compareNotificationWatermarks(
        { id: right.id, occurredAt: right.occurredAt },
        { id: left.id, occurredAt: left.occurredAt },
      ),
    );
}

function session(userId: string): AuthSession {
  return {
    accessToken: `access-${userId}`,
    expiresAt: 4102444800,
    refreshToken: `refresh-${userId}`,
    tokenType: 'bearer',
    user: { id: userId },
  };
}
