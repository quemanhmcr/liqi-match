import type { ComponentProps } from 'react';

import { appRoutes } from './routes';

export type MainTabKey = 'home' | 'explore' | 'messages' | 'profile';

export type MainTabDefinition = {
  href: string;
  icon: ComponentProps<typeof import('@expo/vector-icons').Ionicons>['name'];
  key: MainTabKey;
  label: string;
  routeName: MainTabKey;
};

/**
 * The one contract for persistent primary navigation. Adding a normal screen
 * never changes this file; adding a primary tab is an intentional shell change.
 */
export const MAIN_TABS = [
  {
    href: appRoutes.main.home,
    icon: 'home',
    key: 'home',
    label: 'Trang chủ',
    routeName: 'home',
  },
  {
    href: appRoutes.main.explore,
    icon: 'compass-outline',
    key: 'explore',
    label: 'Khám phá',
    routeName: 'explore',
  },
  {
    href: appRoutes.main.messages,
    icon: 'chatbubble-ellipses-outline',
    key: 'messages',
    label: 'Tin nhắn',
    routeName: 'messages',
  },
  {
    href: appRoutes.main.profile,
    icon: 'person-outline',
    key: 'profile',
    label: 'Hồ sơ',
    routeName: 'profile',
  },
] as const satisfies readonly MainTabDefinition[];

export function mainTabForRoute(routeName: string | undefined) {
  return MAIN_TABS.find((tab) => tab.routeName === routeName) ?? MAIN_TABS[0];
}
