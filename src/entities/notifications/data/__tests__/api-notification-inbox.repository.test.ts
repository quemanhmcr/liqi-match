import { describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';

import {
  ApiNotificationInboxRepository,
  type NotificationApiTransport,
} from '../api-notification-inbox.repository';

const ids = {
  conversation: '60000000-0000-4000-8000-000000000001',
  event1: '80000000-0000-4000-8000-000000000001',
  event2: '80000000-0000-4000-8000-000000000002',
  match: '50000000-0000-4000-8000-000000000001',
  notification1: '90000000-0000-4000-8000-000000000001',
  notification2: '90000000-0000-4000-8000-000000000002',
  notification3: '90000000-0000-4000-8000-000000000003',
  player: '20000000-0000-4000-8000-000000000001',
  friend: '20000000-0000-4000-8000-000000000002',
  profile: '30000000-0000-4000-8000-000000000001',
  session: '42000000-0000-4000-8000-000000000001',
  set: 'a0000000-0000-4000-8000-000000000001',
} as const;

const session: AuthSession = {
  accessToken: 'access-token',
  expiresAt: 4_000_000_000,
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  user: { id: '01000000-0000-4000-8000-000000000001' },
};

function notification(
  overrides: Partial<{
    deepLink:
      | { matchId: string; target: 'match' }
      | { conversationId: string; target: 'conversation' }
      | { setId: string; target: 'set' }
      | { playerId: string; target: 'profile' }
      | { sessionId: string; target: 'session_feedback' }
      | { target: 'home' };
    kind:
      | 'match_created'
      | 'message_received'
      | 'set_invite'
      | 'join_request'
      | 'friendship_requested'
      | 'friendship_accepted'
      | 'system';
    notificationId: string;
    sourceEventId: string;
  }> = {},
) {
  return {
    deepLink: { matchId: ids.match, target: 'match' as const },
    kind: 'match_created' as const,
    notificationId: ids.notification1,
    occurredAt: '2026-07-14T00:00:00.000Z',
    readAt: null,
    recipientPlayerId: ids.player,
    seenAt: null,
    sourceEventId: ids.event1,
    ...overrides,
  };
}

function repositoryWith(response: unknown) {
  const request = jest.fn<NotificationApiTransport['request']>();
  request.mockResolvedValue(response);
  return {
    repository: new ApiNotificationInboxRepository({ request }),
    request,
  };
}

describe('ApiNotificationInboxRepository', () => {
  it('calls the inbox RPC with named arguments and maps canonical variants', async () => {
    const response = {
      items: [
        notification(),
        notification({
          deepLink: {
            conversationId: ids.conversation,
            target: 'conversation',
          },
          kind: 'message_received',
          notificationId: ids.notification2,
          sourceEventId: ids.event2,
        }),
      ],
      latestWatermark: {
        notificationId: ids.notification1,
        occurredAt: '2026-07-14T00:00:00.000Z',
      },
      nextCursor: 'cursor-v1',
      unseenCount: 2,
    };
    const { repository, request } = repositoryWith(response);

    const page = await repository.list({
      cursor: 'cursor-v0',
      limit: 20,
      session,
    });

    expect(request).toHaveBeenCalledWith({
      body: { p_cursor: 'cursor-v0', p_limit: 20 },
      path: 'rpc/list_notifications_v1',
      session,
      signal: undefined,
    });
    expect(page.items).toEqual([
      expect.objectContaining({
        kind: 'match-created',
        payload: { matchId: ids.match },
      }),
      expect.objectContaining({
        kind: 'message-received',
        payload: { conversationId: ids.conversation },
      }),
    ]);
    expect(page.latestWatermark).toEqual({
      id: ids.notification1,
      occurredAt: '2026-07-14T00:00:00.000Z',
    });
  });

  it('maps friendship notifications to canonical PlayerId profile actions', async () => {
    const { repository } = repositoryWith({
      items: [
        notification({
          deepLink: { playerId: ids.friend, target: 'profile' },
          kind: 'friendship_requested',
        }),
        notification({
          deepLink: { playerId: ids.friend, target: 'profile' },
          kind: 'friendship_accepted',
          notificationId: ids.notification2,
          sourceEventId: ids.event2,
        }),
      ],
      latestWatermark: null,
      nextCursor: null,
      unseenCount: 2,
    });

    await expect(repository.list({ session })).resolves.toMatchObject({
      items: [
        {
          kind: 'friendship-requested',
          payload: { requesterPlayerId: ids.friend },
        },
        {
          kind: 'friendship-accepted',
          payload: { friendPlayerId: ids.friend },
        },
      ],
    });
  });

  it('maps production system notifications with feedback and Home destinations', async () => {
    const { repository } = repositoryWith({
      items: [
        notification({
          deepLink: { sessionId: ids.session, target: 'session_feedback' },
          kind: 'system',
          notificationId: ids.notification2,
          sourceEventId: ids.event2,
        }),
        notification({
          deepLink: { target: 'home' },
          kind: 'system',
          notificationId: ids.notification3,
          sourceEventId: '80000000-0000-4000-8000-000000000003',
        }),
      ],
      latestWatermark: null,
      nextCursor: null,
      unseenCount: 2,
    });

    await expect(repository.list({ session })).resolves.toMatchObject({
      items: [
        {
          id: ids.notification2,
          kind: 'system',
          payload: {
            deepLink: { sessionId: ids.session, target: 'session_feedback' },
          },
        },
        {
          id: ids.notification3,
          kind: 'system',
          payload: { deepLink: { target: 'home' } },
        },
      ],
    });
  });

  it('maps friendship notifications to canonical PlayerId profile actions', async () => {
    const { repository } = repositoryWith({
      items: [
        notification({
          deepLink: { playerId: ids.friend, target: 'profile' },
          kind: 'friendship_requested',
        }),
        notification({
          deepLink: { playerId: ids.friend, target: 'profile' },
          kind: 'friendship_accepted',
          notificationId: ids.notification2,
          sourceEventId: ids.event2,
        }),
      ],
      latestWatermark: null,
      nextCursor: null,
      unseenCount: 2,
    });

    await expect(repository.list({ session })).resolves.toMatchObject({
      items: [
        {
          kind: 'friendship-requested',
          payload: { requesterPlayerId: ids.friend },
        },
        {
          kind: 'friendship-accepted',
          payload: { friendPlayerId: ids.friend },
        },
      ],
    });
  });

  it('returns the server-owned seen watermark and timestamp atomically', async () => {
    const { repository, request } = repositoryWith({
      seenAt: '2026-07-14T00:01:00.000Z',
      seenThrough: {
        notificationId: ids.notification1,
        occurredAt: '2026-07-14T00:00:00.000Z',
      },
      unseenCount: 0,
    });

    await expect(
      repository.markSeenThrough({
        seenThrough: {
          id: ids.notification1,
          occurredAt: '2026-07-14T00:00:00.000Z',
        },
        session,
      }),
    ).resolves.toEqual({
      seenAt: '2026-07-14T00:01:00.000Z',
      seenThrough: {
        id: ids.notification1,
        occurredAt: '2026-07-14T00:00:00.000Z',
      },
      unseenCount: 0,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { p_notification_id: ids.notification1 },
        path: 'rpc/mark_notifications_seen_through_v1',
      }),
    );
  });

  it('returns the canonical notification and unseen count from mark-read', async () => {
    const { repository } = repositoryWith({
      notification: {
        ...notification(),
        readAt: '2026-07-14T00:02:00.000Z',
        seenAt: '2026-07-14T00:01:00.000Z',
      },
      unseenCount: 0,
    });

    await expect(
      repository.markRead({ notificationId: ids.notification1, session }),
    ).resolves.toEqual({
      notification: expect.objectContaining({
        id: ids.notification1,
        kind: 'match-created',
        readAt: '2026-07-14T00:02:00.000Z',
      }),
      unseenCount: 0,
    });
  });

  it('rejects a kind/deep-link semantic mismatch', async () => {
    const { repository } = repositoryWith({
      items: [
        notification({
          deepLink: { setId: ids.set, target: 'set' },
          kind: 'message_received',
        }),
      ],
      latestWatermark: null,
      nextCursor: null,
      unseenCount: 1,
    });

    await expect(repository.list({ session })).rejects.toThrow(
      'message_received requires a conversation deep link',
    );
  });
});
