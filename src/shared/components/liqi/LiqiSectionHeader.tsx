import type { ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  liqiColors,
  liqiComponents,
  liqiSpacing,
} from '@/shared/theme/liqi-design-system';

export type LiqiSectionHeaderProps = {
  action?: ReactNode;
  label?: string;
  style?: StyleProp<ViewStyle>;
  title: string;
};

export function LiqiSectionHeader({
  action,
  label,
  style,
  title,
}: LiqiSectionHeaderProps) {
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
    ...liqiComponents.sectionHeader.label,
  },
  shell: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: liqiComponents.sectionHeader.marginTop,
    paddingHorizontal: liqiSpacing.xs,
  },
  title: {
    ...liqiComponents.sectionHeader.title,
    color: liqiColors.text.primary,
    marginTop: liqiSpacing.sm,
  },
});
