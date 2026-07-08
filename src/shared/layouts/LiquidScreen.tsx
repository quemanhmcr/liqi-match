import { BlurTargetView } from 'expo-blur';
import { useRef, type ReactElement, type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  LiquidBackground,
  LiquidBlurTargetProvider,
  LiquidReducedGlassProvider,
} from '@/shared/components/liquid';
import {
  liquidColors,
  liquidLayout,
  liquidTypography,
} from '@/shared/theme/liquid-glass.tokens';

export type LiquidScreenProps = {
  bottomSlot?: ReactNode;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
  subtitle?: string;
  title?: string;
  withBottomNavPadding?: boolean;
  withHeader?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  reducedGlass?: boolean;
};

export function LiquidScreen({
  bottomSlot,
  children,
  contentContainerStyle,
  refreshControl,
  reducedGlass = false,
  scroll = true,
  subtitle,
  title,
  withBottomNavPadding = true,
  withHeader = true,
}: LiquidScreenProps) {
  const blurTargetRef = useRef<View>(null);
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
      <BlurTargetView ref={blurTargetRef} style={StyleSheet.absoluteFill}>
        <LiquidBackground />
      </BlurTargetView>
      <LiquidBlurTargetProvider value={blurTargetRef}>
        <LiquidReducedGlassProvider value={reducedGlass}>
        <SafeAreaView edges={['top']} style={styles.safe}>
          {scroll ? (
            <ScrollView
              contentContainerStyle={[
                styles.scrollContent,
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
                withBottomNavPadding && styles.bottomNavPadding,
                contentContainerStyle,
              ]}
            >
              {content}
            </View>
          )}
          {bottomSlot}
        </SafeAreaView>
        </LiquidReducedGlassProvider>
      </LiquidBlurTargetProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNavPadding: { paddingBottom: liquidLayout.bottomNavSpacer },
  header: {
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  root: { backgroundColor: liquidColors.background.base, flex: 1 },
  safe: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  staticContent: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  subtitle: {
    ...liquidTypography.body,
    marginTop: 5,
  },
  title: {
    ...liquidTypography.screenName,
  },
});
