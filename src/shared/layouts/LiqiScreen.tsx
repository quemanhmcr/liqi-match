import type { ReactElement, ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LiqiBackground } from '@/shared/components/liqi';
import {
  isCompactLiqiViewport,
  liqiColors,
  liqiComponents,
  liqiSpacing,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';

export type LiqiScreenProps = Readonly<{
  bottomSlot?: ReactNode;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: ReactElement<RefreshControlProps>;
  scroll?: boolean;
  subtitle?: string;
  title?: string;
  withBottomNavPadding?: boolean;
  withHeader?: boolean;
}>;

export function LiqiScreen({
  bottomSlot,
  children,
  contentContainerStyle,
  refreshControl,
  scroll = true,
  subtitle,
  title,
  withBottomNavPadding = true,
  withHeader = true,
}: LiqiScreenProps) {
  const { width } = useWindowDimensions();
  const compact = isCompactLiqiViewport(width);
  const content = (
    <>
      {withHeader && title ? (
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      {children}
    </>
  );

  return (
    <View style={styles.root}>
      <LiqiBackground />
      <SafeAreaView edges={['top']} style={styles.safe}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              compact && styles.compactContent,
              withBottomNavPadding && styles.bottomNavPadding,
              contentContainerStyle,
            ]}
            refreshControl={refreshControl}
            showsVerticalScrollIndicator={false}
          >
            {content}
          </ScrollView>
        ) : (
          <View
            style={[
              styles.staticContent,
              compact && styles.compactContent,
              withBottomNavPadding && styles.bottomNavPadding,
              contentContainerStyle,
            ]}
          >
            {content}
          </View>
        )}
        {bottomSlot}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNavPadding: {
    paddingBottom: liqiComponents.screen.bottomNavSpacer,
  },
  compactContent: {
    paddingHorizontal: liqiComponents.screen.gutterCompact,
  },
  header: {
    marginBottom: liqiSpacing['4xl'],
    paddingHorizontal: liqiSpacing.xs,
  },
  root: { backgroundColor: liqiColors.background.base, flex: 1 },
  safe: { flex: 1 },
  scrollContent: {
    paddingHorizontal: liqiComponents.screen.gutter,
    paddingTop: liqiComponents.screen.topPadding,
  },
  staticContent: {
    flex: 1,
    paddingHorizontal: liqiComponents.screen.gutter,
    paddingTop: liqiComponents.screen.topPadding,
  },
  subtitle: {
    ...liqiTypography.body,
    marginTop: liqiSpacing.sm,
  },
  title: {
    ...liqiTypography.screenTitle,
  },
});
