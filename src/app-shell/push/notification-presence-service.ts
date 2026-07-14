import type { AuthSession } from '@/shared/auth/auth-service';
import type { ConversationId } from '@/shared/contracts/core-v1';

import type { NotificationDeviceApiRepository } from './notification-device-api.repository';

export class NotificationPresenceService {
  constructor(private readonly api: NotificationDeviceApiRepository) {}

  foreground(
    input: Readonly<{
      activeConversationId: ConversationId | null;
      deviceInstallationId: string;
      session: AuthSession;
      signal?: AbortSignal;
    }>,
  ) {
    return this.api.upsertPresence({
      activeConversationId: input.activeConversationId,
      deviceInstallationId: input.deviceInstallationId,
      session: input.session,
      signal: input.signal,
      state: 'foreground',
    });
  }

  background(
    input: Readonly<{
      deviceInstallationId: string;
      session: AuthSession;
      signal?: AbortSignal;
    }>,
  ) {
    return this.api.upsertPresence({
      activeConversationId: null,
      deviceInstallationId: input.deviceInstallationId,
      session: input.session,
      signal: input.signal,
      state: 'background',
    });
  }
}
