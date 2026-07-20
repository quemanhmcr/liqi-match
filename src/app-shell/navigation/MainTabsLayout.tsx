import { router, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { appRoutes } from './routes';
import { MainTabBar } from './MainTabBar';
import { MAIN_TABS, type MainTabKey } from './main-tabs';

type ExpoTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>['tabBar']>
>[0];

type NavigatorTabRoute = { key: string; name: string };

type NavigatorTabActions = {
  emitTabLongPress: (target: string) => void;
  emitTabPress: (target: string) => { defaultPrevented?: boolean };
  navigate: (routeName: string) => void;
};

type MainTabInteractionInput = {
  actions: NavigatorTabActions;
  activeRouteKey: string | undefined;
  routes: readonly NavigatorTabRoute[];
};

/** Mirrors the cancellable semantics of Expo's default bottom tab bar. */
export function selectMainTab(
  { actions, activeRouteKey, routes }: MainTabInteractionInput,
  key: MainTabKey,
) {
  const route = routes.find((item) => item.name === key);
  if (!route) return;

  const event = actions.emitTabPress(route.key);
  if (activeRouteKey !== route.key && !event.defaultPrevented) {
    actions.navigate(route.name);
  }
}

export function longPressMainTab(
  { actions, routes }: MainTabInteractionInput,
  key: MainTabKey,
) {
  const route = routes.find((item) => item.name === key);
  if (route) actions.emitTabLongPress(route.key);
}

export function MainTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        freezeOnBlur: true,
        headerShown: false,
        lazy: true,
      }}
      tabBar={(props) => <ExpoMainTabBar {...props} />}
    >
      {MAIN_TABS.map((tab) => (
        <Tabs.Screen key={tab.key} name={tab.routeName} />
      ))}
    </Tabs>
  );
}

function ExpoMainTabBar({ insets, navigation, state }: ExpoTabBarProps) {
  const activeRoute = state.routes[state.index];
  const actions: NavigatorTabActions = {
    emitTabLongPress: (target) => {
      navigation.emit({ target, type: 'tabLongPress' });
    },
    emitTabPress: (target) =>
      navigation.emit({
        canPreventDefault: true,
        target,
        type: 'tabPress',
      }),
    navigate: (routeName) => navigation.navigate(routeName as never),
  };

  return (
    <MainTabBar
      activeRouteName={activeRoute?.name}
      bottomInset={insets.bottom}
      horizontalInset={Math.max(insets.left, insets.right)}
      onOpenSessions={() => router.push(appRoutes.sessions.list)}
      onLongSelect={(key) =>
        longPressMainTab(
          { actions, activeRouteKey: activeRoute?.key, routes: state.routes },
          key,
        )
      }
      onSelect={(key) =>
        selectMainTab(
          { actions, activeRouteKey: activeRoute?.key, routes: state.routes },
          key,
        )
      }
    />
  );
}
