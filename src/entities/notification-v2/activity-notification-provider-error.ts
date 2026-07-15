export type ActivityNotificationProviderErrorCode =
  | 'activity_notification_click_conflict'
  | 'activity_notification_event_replay_conflict';

export class ActivityNotificationProviderError extends Error {
  constructor(readonly code: ActivityNotificationProviderErrorCode) {
    super(code);
    this.name = 'ActivityNotificationProviderError';
  }
}
