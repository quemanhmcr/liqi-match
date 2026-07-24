import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { NotificationFilterBar } from '../components/NotificationFilterBar';

const filterLabels = [
  'Lọc Tất cả',
  'Lọc Chưa đọc',
  'Lọc Tin nhắn',
  'Lọc Hoạt động',
  'Lọc Hệ thống',
] as const;

describe('NotificationFilterBar', () => {
  it('renders the complete taxonomy with one canonical selected chip', async () => {
    const screen = await render(
      <NotificationFilterBar activeFilter="all" onSelect={jest.fn()} />,
    );

    for (const label of filterLabels) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(
      screen.getByLabelText('Lọc Tất cả').props.accessibilityState,
    ).toEqual({
      selected: true,
    });
    expect(
      screen.getByLabelText('Lọc Tin nhắn').props.accessibilityState,
    ).toEqual({ selected: false });
  });

  it('delegates selection without owning filter semantics', async () => {
    const onSelect = jest.fn();
    const screen = await render(
      <NotificationFilterBar activeFilter="all" onSelect={onSelect} />,
    );

    await fireEvent.press(screen.getByLabelText('Lọc Tin nhắn'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('message');
  });
});
