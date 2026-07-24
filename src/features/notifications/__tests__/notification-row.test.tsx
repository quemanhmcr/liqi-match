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

const standardGeometryCases: [
  layout: string,
  compact: boolean,
  minHeight: number,
][] = [
  ['regular', false, notificationsUi.metrics.row.standardMinHeight],
  ['compact', true, notificationsUi.metrics.row.standardMinHeightCompact],
];

describe('NotificationRow', () => {
  it.each(standardGeometryCases)(
    'uses a dense %s standard social row as the whole action target',
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
      const contentStyle = StyleSheet.flatten(
        screen.getByTestId('notification-row-notification-row-test-content')
          .props.style,
      );
      expect(contentStyle).toMatchObject({ minHeight });
      expect(contentStyle.backgroundColor).toBeUndefined();
      expect(contentStyle.borderColor).toBeUndefined();
    },
  );

  it('uses a restrained rich surface only for reward content', async () => {
    const screen = await render(
      <NotificationRow
        compact={false}
        item={item({
          reward: { icon: 'diamond-outline', label: 'x50', tone: 'purple' },
        })}
        onAction={jest.fn()}
      />,
    );
    const style = StyleSheet.flatten(
      screen.getByTestId('notification-row-notification-row-test-content').props
        .style,
    );
    expect(style).toMatchObject({
      backgroundColor: notificationsUi.colors.richSurface,
      borderColor: notificationsUi.colors.richBorder,
      minHeight: notificationsUi.metrics.row.richMinHeight,
    });
  });

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
