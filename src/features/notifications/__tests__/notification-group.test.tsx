import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { NotificationGroup } from '../components/NotificationGroup';
import type { NotificationItem } from '../model/notification-view-model';

function item(id: string): NotificationItem {
  return {
    action: { destination: { kind: 'home' }, label: 'Mở' },
    attentionState: 'unread',
    category: 'system',
    group: 'Hôm nay',
    id,
    messageParts: ['Có cập nhật mới dành cho bạn'],
    timeLabel: 'Vừa xong',
    title: 'Hệ thống:',
    visual: { icon: 'notifications-outline', kind: 'symbol', tone: 'blue' },
  };
}

describe('NotificationGroup', () => {
  it('uses one quiet separator between dense social rows', async () => {
    const screen = await render(
      <NotificationGroup
        compact={false}
        items={[item('first'), item('second')]}
        label="Hôm nay"
        onAction={jest.fn()}
      />,
    );

    expect(screen.getByTestId('notification-separator-first')).toBeTruthy();
    expect(screen.queryByTestId('notification-separator-second')).toBeNull();
  });
});
