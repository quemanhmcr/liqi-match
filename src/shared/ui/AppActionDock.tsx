import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sharedUiRecipes } from './internal/component-recipes';

export type AppActionDockProps = Readonly<{
  /** Primary and secondary actions, plus optional compact supporting copy. */
  children: ReactNode;
  /** Layout overrides for the inner horizontal action row. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Layout overrides for the outer dock; safe-area padding remains owned here. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

/**
 * Canonical footer for actions that complete a non-tab full-screen flow.
 *
 * Owns the bottom safe-area inset, top divider and shared dock surface. The
 * parent screen decides where the footer is mounted; this component does not
 * use absolute positioning. Do not use it as a tab bar or an inline button row.
 */
export function AppActionDock({
  children,
  contentStyle,
  style,
  testID,
}: AppActionDockProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.host,
        {
          paddingBottom: Math.max(
            insets.bottom,
            sharedUiRecipes.actionDock.minimumBottomInset,
          ),
        },
        style,
      ]}
      testID={testID}
    >
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: sharedUiRecipes.actionDock.gap,
  },
  host: {
    backgroundColor: sharedUiRecipes.actionDock.background,
    borderTopColor: sharedUiRecipes.actionDock.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: sharedUiRecipes.actionDock.minimumHeight,
    paddingHorizontal: sharedUiRecipes.actionDock.paddingHorizontal,
    paddingTop: sharedUiRecipes.actionDock.paddingTop,
  },
});
