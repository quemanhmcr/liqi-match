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
import { shouldUseNativeLiquidBlur } from '@/shared/components/liquid/LiquidGlassSurface';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

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

  it('keeps navigator chrome dark independently of the operating-system theme', () => {
    expect(appNavigationTheme.dark).toBe(true);
    expect(appNavigationTheme.colors.background).toBe(
      liquidColors.background.base,
    );
    expect(appNavigationTheme.colors.card).toBe(liquidColors.background.base);
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

  it('retains all four visual tab items through repeated route commits', async () => {
    const onSelect = jest.fn();
    const { getByLabelText, getByTestId, rerender } = await render(
      <MainTabBar activeRouteName="home" onSelect={onSelect} />,
    );

    for (const activeTab of [...MAIN_TABS, MAIN_TABS[0]]) {
      await rerender(
        <MainTabBar
          activeRouteName={activeTab.routeName}
          onSelect={onSelect}
        />,
      );

      const content = getByTestId('main-bottom-nav-content');
      const renderedTabs = MAIN_TABS.map((tab) =>
        within(content).getByTestId(`main-bottom-nav-item-${tab.key}`),
      );

      expect(renderedTabs).toHaveLength(MAIN_TABS.length);
      expect(
        renderedTabs.filter(
          (tab) => tab.props.accessibilityState?.selected === true,
        ),
      ).toHaveLength(1);
      expect(getByLabelText(activeTab.label).props.accessibilityState).toEqual({
        selected: true,
      });
    }
  });

  it('keeps native blur as a non-interactive sibling behind tab buttons', async () => {
    const { getByTestId } = await render(
      <MainTabBar activeRouteName="home" onSelect={jest.fn()} />,
    );
    const backdrop = getByTestId('main-bottom-nav-backdrop');
    const content = getByTestId('main-bottom-nav-content');

    expect(backdrop.props.pointerEvents).toBe('none');
    expect(within(backdrop).queryByLabelText('Trang chủ')).toBeNull();
    expect(within(content).getByLabelText('Trang chủ')).toBeTruthy();
    expect(within(content).getByLabelText('Khám phá')).toBeTruthy();
    expect(within(content).getByLabelText('Tin nhắn')).toBeTruthy();
    expect(within(content).getByLabelText('Hồ sơ')).toBeTruthy();
  });

  it('uses a deterministic View fallback on Android without a blur target', () => {
    expect(shouldUseNativeLiquidBlur('android', false)).toBe(false);
    expect(shouldUseNativeLiquidBlur('android', true)).toBe(true);
    expect(shouldUseNativeLiquidBlur('ios', false)).toBe(true);
  });

  it('keeps the bar above a device bottom inset on a dark host', async () => {
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
      backgroundColor: liquidColors.background.base,
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
