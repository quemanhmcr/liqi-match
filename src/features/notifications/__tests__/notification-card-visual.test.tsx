import { describe, expect, it } from '@jest/globals';

import {
  notificationsUi,
  resolveNotificationCardVisual,
} from '../ui/notifications-ui';

describe('notification card visual authority', () => {
  it('distinguishes new from exposed unread without changing geometry', () => {
    const fresh = resolveNotificationCardVisual('new');
    const unread = resolveNotificationCardVisual('unread');

    expect(fresh.attentionColor).toBe(notificationsUi.colors.attentionNew);
    expect(unread.attentionColor).toBe(notificationsUi.colors.attentionUnread);
    expect(fresh.frameGradient).not.toEqual(unread.frameGradient);
    expect(fresh.backgroundColor).toBe(unread.backgroundColor);
  });

  it('renders read notifications as quiet cards with no attention marker', () => {
    expect(resolveNotificationCardVisual('read')).toEqual({
      attentionColor: null,
      backgroundColor: notificationsUi.colors.readBackground,
      emphasis: 'none',
      frameGradient: notificationsUi.gradients.readFrame,
    });
  });
});
