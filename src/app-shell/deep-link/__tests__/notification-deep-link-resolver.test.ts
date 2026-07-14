import { describe, expect, it, jest } from '@jest/globals';

import {
  ApiNotificationDeepLinkResolver,
  type NotificationDeepLinkApiTransport,
} from '@/app-shell/deep-link';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  NotificationIdSchema,
  EventIdSchema,
} from '@/shared/contracts/core-v1';

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

function transportWith(response: unknown) {
  const request = jest.fn<NotificationDeepLinkApiTransport['request']>();
  request.mockResolvedValue(response);
  return { request };
}

describe('ApiNotificationDeepLinkResolver', () => {
  it('sends semantic NotificationId and source EventId as named RPC arguments', async () => {
    const transport = transportWith({
      deepLink: {
        conversationId: '60000000-0000-4000-8000-000000000001',
        target: 'conversation',
      },
      notificationId,
      playerLifecycle: 'active',
      readAt: '2026-07-14T08:01:00.000Z',
      resolvedAt: '2026-07-14T08:01:00.000Z',
      status: 'available',
    });
    const resolver = new ApiNotificationDeepLinkResolver(transport);

    await expect(
      resolver.resolve({ notificationId, session, sourceEventId }),
    ).resolves.toMatchObject({
      notificationId,
      status: 'available',
    });
    expect(transport.request).toHaveBeenCalledWith({
      body: {
        p_notification_id: notificationId,
        p_source_event_id: sourceEventId,
      },
      session,
      signal: undefined,
    });
  });

  it('rejects an available response without a canonical destination', async () => {
    const resolver = new ApiNotificationDeepLinkResolver(
      transportWith({
        deepLink: null,
        notificationId,
        playerLifecycle: 'active',
        readAt: '2026-07-14T08:01:00.000Z',
        resolvedAt: '2026-07-14T08:01:00.000Z',
        status: 'available',
      }),
    );

    await expect(
      resolver.resolve({ notificationId, session, sourceEventId }),
    ).rejects.toThrow('Available resolution requires a canonical deep link');
  });
});
