import * as Notifications from 'expo-notifications';

import {
  ConversationIdSchema,
  PushNotificationNavigationDataV1Schema,
  type ConversationId,
} from '@/shared/contracts/core-v1';

export class ExpoNotificationPresentationController {
  private activeConversationId: ConversationId | null = null;

  install() {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const payload = PushNotificationNavigationDataV1Schema.safeParse(
          notification.request.content.data,
        );
        const shouldSuppress =
          payload.success &&
          payload.data.deepLink.target === 'conversation' &&
          this.activeConversationId !== null &&
          payload.data.deepLink.conversationId === this.activeConversationId;

        return {
          shouldPlaySound: !shouldSuppress,
          shouldSetBadge: false,
          shouldShowBanner: !shouldSuppress,
          shouldShowList: !shouldSuppress,
        };
      },
    });
  }

  setActiveConversation(value: unknown) {
    const parsed = ConversationIdSchema.safeParse(value);
    this.activeConversationId = parsed.success ? parsed.data : null;
  }
}
