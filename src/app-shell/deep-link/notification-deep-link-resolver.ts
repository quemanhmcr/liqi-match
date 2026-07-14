import {
  NotificationDeepLinkResolutionV1Schema,
  type NotificationDeepLinkResolutionV1,
  type NotificationId,
  type EventId,
} from '@/shared/contracts/core-v1';
import type { AuthSession } from '@/shared/auth/auth-service';
import { supabaseRest } from '@/shared/services/supabase-rest';

export type ResolveNotificationDeepLinkInput = Readonly<{
  notificationId: NotificationId;
  session: AuthSession;
  signal?: AbortSignal;
  sourceEventId: EventId;
}>;

export type NotificationDeepLinkApiRequest = Readonly<{
  body: Readonly<{
    p_notification_id: NotificationId;
    p_source_event_id: EventId;
  }>;
  session: AuthSession;
  signal?: AbortSignal;
}>;

export interface NotificationDeepLinkApiTransport {
  request(request: NotificationDeepLinkApiRequest): Promise<unknown>;
}

export interface NotificationDeepLinkResolver {
  resolve(
    input: ResolveNotificationDeepLinkInput,
  ): Promise<NotificationDeepLinkResolutionV1>;
}

export class ApiNotificationDeepLinkResolver implements NotificationDeepLinkResolver {
  constructor(
    private readonly transport: NotificationDeepLinkApiTransport = createNotificationDeepLinkSupabaseTransport(),
  ) {}

  async resolve(input: ResolveNotificationDeepLinkInput) {
    const response = await this.transport.request({
      body: {
        p_notification_id: input.notificationId,
        p_source_event_id: input.sourceEventId,
      },
      session: input.session,
      signal: input.signal,
    });
    return NotificationDeepLinkResolutionV1Schema.parse(response);
  }
}

export function createNotificationDeepLinkSupabaseTransport(): NotificationDeepLinkApiTransport {
  return {
    request: ({ body, session, signal }) =>
      supabaseRest<unknown>('rpc/resolve_notification_deep_link_v1', {
        body,
        method: 'POST',
        session,
        signal,
      }),
  };
}
