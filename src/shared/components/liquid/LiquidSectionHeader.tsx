import type { ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { liquidTypography } from '@/shared/theme/liquid-glass.tokens';

export type LiquidSectionHeaderProps = {
  action?: ReactNode;
  label?: string;
  style?: StyleProp<ViewStyle>;
  title: string;
};

export function LiquidSectionHeader({
  action,
  label,
  style,
  title,
}: LiquidSectionHeaderProps) {
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
    ...liquidTypography.sectionLabel,
    fontWeight: '700',
    letterSpacing: 0.38,
  },
  shell: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
    paddingHorizontal: 4,
  },
  title: {
    ...liquidTypography.sectionTitle,
    color: 'rgba(248,250,255,0.92)',
    fontWeight: '600',
    letterSpacing: -0.22,
    marginTop: 5,
  },
});
