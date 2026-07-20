import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { appNavigationTheme } from '@/app-shell/navigation/app-navigation-theme';
import { MainTabBar } from '@/app-shell/navigation/MainTabBar';
import {
  longPressMainTab,
  selectMainTab,
} from '@/app-shell/navigation/MainTabsLayout';
import { MAIN_TABS, mainTabForRoute } from '@/app-shell/navigation/main-tabs';
import { appColors } from '@/shared/ui';

const visualTabLabels = {
  explore: 'Khám phá',
  home: 'Trang chủ',
  messages: 'Tin nhắn',
  profile: 'Cá nhân',
} as const;

describe('primary tab contract', () => {
  it('has stable unique navigator keys, route names, and URLs', () => {
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

  it('keeps navigator chrome dark independently of the operating-system theme', () => {
    expect(appNavigationTheme.dark).toBe(true);
    expect(appNavigationTheme.colors.background).toBe(
      appColors.background.base,
    );
    expect(appNavigationTheme.colors.card).toBe(appColors.background.base);
  });

  it('emits navigator tabs and opens Sessions through the dedicated room action', async () => {
    const onSelect = jest.fn();
    const onOpenSessions = jest.fn();
    const { getByLabelText } = await render(
      <MainTabBar
        activeRouteName="home"
        onOpenSessions={onOpenSessions}
        onSelect={onSelect}
      />,
    );

    expect(getByLabelText('Trang chủ').props.accessibilityState).toEqual({
      selected: true,
    });

    await fireEvent.press(getByLabelText('Tin nhắn'));
    await fireEvent.press(getByLabelText('Phòng'));

    expect(onSelect).toHaveBeenCalledWith('messages');
    expect(onOpenSessions).toHaveBeenCalledTimes(1);
  });

  it('renders the five-position reference bar through repeated route commits', async () => {
    const onSelect = jest.fn();
    const onOpenSessions = jest.fn();
    const { getByLabelText, getByTestId, rerender } = await render(
      <MainTabBar
        activeRouteName="home"
        onOpenSessions={onOpenSessions}
        onSelect={onSelect}
      />,
    );

    for (const activeTab of [...MAIN_TABS, MAIN_TABS[0]]) {
      await rerender(
        <MainTabBar
          activeRouteName={activeTab.routeName}
          onOpenSessions={onOpenSessions}
          onSelect={onSelect}
        />,
      );

      const content = getByTestId('main-bottom-nav-content');
      const renderedItems = [
        'home',
        'messages',
        'explore',
        'sessions',
        'profile',
      ].map((key) =>
        within(content).getByTestId(`main-bottom-nav-item-${key}`),
      );

      expect(renderedItems).toHaveLength(5);
      expect(
        renderedItems.filter(
          (item) => item.props.accessibilityState?.selected === true,
        ),
      ).toHaveLength(1);
      expect(
        getByLabelText(visualTabLabels[activeTab.key]).props.accessibilityState,
      ).toEqual({ selected: true });
    }
  });

  it('keeps the center heart elevated above the navigation surface', async () => {
    const { getByLabelText, getByTestId } = await render(
      <MainTabBar
        activeRouteName="explore"
        onOpenSessions={jest.fn()}
        onSelect={jest.fn()}
      />,
    );
    const content = getByTestId('main-bottom-nav-content');
    const centerHeart = StyleSheet.flatten(
      getByTestId('main-bottom-nav-center-heart').props.style,
    );

    expect(within(content).getByLabelText('Trang chủ')).toBeTruthy();
    expect(within(content).getByLabelText('Tin nhắn')).toBeTruthy();
    expect(within(content).getByLabelText('Khám phá')).toBeTruthy();
    expect(within(content).getByLabelText('Phòng')).toBeTruthy();
    expect(within(content).getByLabelText('Cá nhân')).toBeTruthy();
    expect(getByLabelText('Khám phá').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(centerHeart).toMatchObject({
      borderRadius: 36,
      height: 72,
      width: 72,
    });
  });

  it('uses compact production metrics on narrow phones', async () => {
    const { getByTestId } = await render(
      <MainTabBar
        activeRouteName="home"
        onOpenSessions={jest.fn()}
        onSelect={jest.fn()}
        viewportWidth={360}
      />,
    );

    expect(
      StyleSheet.flatten(
        getByTestId('main-bottom-nav-center-heart').props.style,
      ),
    ).toMatchObject({
      borderRadius: 31,
      height: 62,
      width: 62,
    });
    expect(
      StyleSheet.flatten(getByTestId('main-tab-bar').props.style),
    ).toMatchObject({ paddingTop: 14 });
  });

  it('keeps the bar above a device bottom inset on a dark host', async () => {
    const { getByTestId } = await render(
      <MainTabBar
        activeRouteName="home"
        bottomInset={34}
        horizontalInset={0}
        onOpenSessions={jest.fn()}
        onSelect={jest.fn()}
      />,
    );

    expect(
      StyleSheet.flatten(getByTestId('main-tab-bar').props.style),
    ).toMatchObject({
      backgroundColor: appColors.background.base,
      flexShrink: 0,
      paddingBottom: 34,
    });
  });

  it('preserves cancellable navigator tab events and ignores stale routes', () => {
    const routes = [
      { key: 'home-key', name: 'home' },
      { key: 'messages-key', name: 'messages' },
    ];
    const actions = {
      emitTabLongPress: jest.fn(),
      emitTabPress: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    };

    selectMainTab({ actions, activeRouteKey: 'home-key', routes }, 'home');
    expect(actions.emitTabPress).toHaveBeenCalledWith('home-key');
    expect(actions.navigate).not.toHaveBeenCalled();

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

    selectMainTab({ actions, activeRouteKey: 'home-key', routes }, 'profile');
    expect(actions.emitTabPress).toHaveBeenCalledTimes(3);
    expect(actions.navigate).toHaveBeenCalledTimes(1);
  });
});
