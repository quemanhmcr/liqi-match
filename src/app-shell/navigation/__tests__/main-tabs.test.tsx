import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { MainTabBar } from '@/app-shell/navigation/MainTabBar';
import {
  longPressMainTab,
  selectMainTab,
} from '@/app-shell/navigation/MainTabsLayout';
import { MAIN_TABS, mainTabForRoute } from '@/app-shell/navigation/main-tabs';

describe('primary tab contract', () => {
  it('has stable unique keys, route names, and URLs', () => {
    expect(MAIN_TABS.map((tab) => tab.key)).toEqual([
      'home',
      'explore',
      'messages',
      'profile',
    ]);
    expect(new Set(MAIN_TABS.map((tab) => tab.routeName)).size).toBe(
      MAIN_TABS.length,
    );
    expect(new Set(MAIN_TABS.map((tab) => tab.href)).size).toBe(
      MAIN_TABS.length,
    );
    expect(mainTabForRoute('unknown').key).toBe('home');
  });

  it('emits the selected tab key and exposes tab accessibility state', async () => {
    const onSelect = jest.fn();
    const { getByLabelText } = await render(
      <MainTabBar activeRouteName="home" onSelect={onSelect} />,
    );

    expect(getByLabelText('Trang chủ').props.accessibilityState).toEqual({
      selected: true,
    });

    await fireEvent.press(getByLabelText('Tin nhắn'));

    expect(onSelect).toHaveBeenCalledWith('messages');
  });

  it('keeps the bar above a device bottom inset', async () => {
    const { getByTestId } = await render(
      <MainTabBar
        activeRouteName="home"
        bottomInset={34}
        horizontalInset={0}
        onSelect={jest.fn()}
      />,
    );

    expect(
      StyleSheet.flatten(getByTestId('main-tab-bar').props.style),
    ).toMatchObject({
      paddingBottom: 34,
    });
  });

  it('preserves cancellable navigator tab events', () => {
    const routes = [
      { key: 'home-key', name: 'home' },
      { key: 'messages-key', name: 'messages' },
    ];
    const actions = {
      emitTabLongPress: jest.fn(),
      emitTabPress: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    };

    selectMainTab({ actions, activeRouteKey: 'home-key', routes }, 'messages');
    longPressMainTab(
      { actions, activeRouteKey: 'home-key', routes },
      'messages',
    );

    expect(actions.emitTabPress).toHaveBeenCalledWith('messages-key');
    expect(actions.navigate).toHaveBeenCalledWith('messages');
    expect(actions.emitTabLongPress).toHaveBeenCalledWith('messages-key');

    actions.emitTabPress.mockReturnValueOnce({ defaultPrevented: true });
    selectMainTab({ actions, activeRouteKey: 'home-key', routes }, 'messages');

    expect(actions.navigate).toHaveBeenCalledTimes(1);
  });
});
