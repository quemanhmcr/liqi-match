import type { ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { appColors, appSpacing } from './theme/app-theme';
import { sharedUiRecipes } from './internal/component-recipes';

export type AppSectionHeaderProps = {
  action?: ReactNode;
  label?: string;
  style?: StyleProp<ViewStyle>;
  title: string;
};

export function AppSectionHeader({
  action,
  label,
  style,
  title,
}: AppSectionHeaderProps) {
  return (
    <View style={[styles.shell, style]}>
      <View>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...sharedUiRecipes.sectionHeader.label,
  },
  shell: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: sharedUiRecipes.sectionHeader.marginTop,
    paddingHorizontal: appSpacing.xs,
  },
  title: {
    ...sharedUiRecipes.sectionHeader.title,
    color: appColors.text.primary,
    marginTop: appSpacing.sm,
  },
});
