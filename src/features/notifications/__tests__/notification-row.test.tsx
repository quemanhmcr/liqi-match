import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { NotificationRow } from '../components/NotificationRow';
import type { NotificationItem } from '../model/notification-view-model';
import { notificationsUi } from '../ui/notifications-ui';

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    action: {
      destination: { kind: 'home' },
      label: 'Mở',
    },
    attentionState: 'new',
    category: 'system',
    group: 'Hôm nay',
    id: 'notification-row-test',
    messageParts: ['Có cập nhật mới dành cho bạn'],
    timeLabel: 'Vừa xong',
    title: 'Hệ thống:',
    visual: { icon: 'notifications-outline', kind: 'symbol', tone: 'blue' },
    ...overrides,
  };
}

const geometryCases: [layout: string, compact: boolean, minHeight: number][] = [
  ['regular', false, notificationsUi.metrics.row.minHeight],
  ['compact', true, notificationsUi.metrics.row.minHeightCompact],
];

describe('NotificationRow', () => {
  it.each(geometryCases)(
    'keeps the %s whole-card action touch-safe',
    async (_layout, compact, minHeight) => {
      const onAction = jest.fn();
      const screen = await render(
        <NotificationRow compact={compact} item={item()} onAction={onAction} />,
      );

      await fireEvent.press(screen.getByLabelText('Mở Hệ thống:'));
      expect(onAction).toHaveBeenCalledTimes(1);
      expect(
        screen.getByTestId('notification-attention-notification-row-test'),
      ).toBeTruthy();
      expect(
        StyleSheet.flatten(
          screen.getByTestId('notification-row-notification-row-test-content')
            .props.style,
        ),
      ).toMatchObject({ minHeight });
    },
  );

  it('acknowledges an unread destinationless item without inventing navigation', async () => {
    const onAction = jest.fn();
    const screen = await render(
      <NotificationRow
        compact={false}
        item={item({ action: undefined, attentionState: 'unread' })}
        onAction={onAction}
      />,
    );

    expect(screen.queryByLabelText('Mở Hệ thống:')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Đánh dấu đã đọc Hệ thống:'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders a read destinationless item as content instead of a fake button', async () => {
    const screen = await render(
      <NotificationRow
        compact={false}
        item={item({ action: undefined, attentionState: 'read' })}
        onAction={jest.fn()}
      />,
    );

    expect(screen.queryByLabelText('Đánh dấu đã đọc Hệ thống:')).toBeNull();
    expect(
      screen.queryByTestId('notification-attention-notification-row-test'),
    ).toBeNull();
    expect(
      screen.getByLabelText(
        'Hệ thống:. Có cập nhật mới dành cho bạn. Vừa xong',
      ),
    ).toBeTruthy();
  });
});
