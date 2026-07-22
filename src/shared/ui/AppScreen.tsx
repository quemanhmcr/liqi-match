import type { ReactElement, ReactNode, Ref } from 'react';
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

import { AppBackground } from './AppBackground';
import {
  isCompactViewport,
  appColors,
  appSpacing,
  appTypography,
} from './theme/app-theme';
import { sharedUiRecipes } from './internal/component-recipes';

export type AppScreenProps = Readonly<{
  backgroundSlot?: ReactNode;
  bottomSlot?: ReactNode;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: ReactElement<RefreshControlProps>;
  scroll?: boolean;
  scrollViewRef?: Ref<ScrollView>;
  subtitle?: string;
  title?: string;
  withBottomNavPadding?: boolean;
  withHeader?: boolean;
}>;

export function AppScreen({
  backgroundSlot,
  bottomSlot,
  children,
  contentContainerStyle,
  refreshControl,
  scroll = true,
  scrollViewRef,
  subtitle,
  title,
  withBottomNavPadding = true,
  withHeader = true,
}: AppScreenProps) {
  const { width } = useWindowDimensions();
  const compact = isCompactViewport(width);
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
      <AppBackground />
      {backgroundSlot}
      <SafeAreaView edges={['top']} style={styles.safe}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              compact && styles.compactContent,
              withBottomNavPadding && styles.bottomNavPadding,
              contentContainerStyle,
            ]}
            ref={scrollViewRef}
            refreshControl={refreshControl}
            showsVerticalScrollIndicator={false}
            testID="app-screen-scroll"
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
            testID="app-screen-static"
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
    paddingBottom: sharedUiRecipes.screen.bottomNavSpacer,
  },
  compactContent: {
    paddingHorizontal: sharedUiRecipes.screen.gutterCompact,
  },
  header: {
    marginBottom: appSpacing['4xl'],
    paddingHorizontal: appSpacing.xs,
  },
  root: { backgroundColor: appColors.background.base, flex: 1 },
  safe: { flex: 1 },
  scrollContent: {
    paddingHorizontal: sharedUiRecipes.screen.gutter,
    paddingTop: sharedUiRecipes.screen.topPadding,
  },
  staticContent: {
    flex: 1,
    paddingHorizontal: sharedUiRecipes.screen.gutter,
    paddingTop: sharedUiRecipes.screen.topPadding,
  },
  subtitle: {
    ...appTypography.body,
    marginTop: appSpacing.sm,
  },
  title: {
    ...appTypography.screenTitle,
  },
});
