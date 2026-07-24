import { describe, expect, it } from '@jest/globals';

import {
  notificationsUi,
  resolveNotificationRowVisual,
} from '../ui/notifications-ui';

describe('notification row visual authority', () => {
  it('distinguishes attention with one restrained in-layout marker', () => {
    expect(resolveNotificationRowVisual('new')).toEqual({
      attentionColor: notificationsUi.colors.attentionNew,
      attentionSize: notificationsUi.metrics.attentionDotNew,
    });
    expect(resolveNotificationRowVisual('unread')).toEqual({
      attentionColor: notificationsUi.colors.attentionUnread,
      attentionSize: notificationsUi.metrics.attentionDot,
    });
    expect(resolveNotificationRowVisual('read')).toEqual({
      attentionColor: null,
      attentionSize: 0,
    });
  });
});
