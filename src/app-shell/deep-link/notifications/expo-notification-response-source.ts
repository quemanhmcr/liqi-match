import * as Notifications from 'expo-notifications';

import type {
  NotificationResponseLike,
  NotificationResponseSource,
} from './notification-response-bridge';

export function createExpoNotificationResponseSource(): NotificationResponseSource {
  return {
    addResponseListener: (listener) =>
      Notifications.addNotificationResponseReceivedListener((response) =>
        listener(toNotificationResponseLike(response)),
      ),
    clearLastResponse: () => Notifications.clearLastNotificationResponseAsync(),
    getLastResponse: async () => {
      const response = await Notifications.getLastNotificationResponseAsync();
      return response ? toNotificationResponseLike(response) : null;
    },
  };
}

function toNotificationResponseLike(
  response: Notifications.NotificationResponse,
): NotificationResponseLike {
  return {
    notification: {
      request: {
        content: { data: response.notification.request.content.data },
        identifier: response.notification.request.identifier,
      },
    },
  };
}
