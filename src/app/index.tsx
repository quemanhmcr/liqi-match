import Constants from 'expo-constants';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '@/shared/theme';

type AppVariant = 'development' | 'preview' | 'production';

function getAppVariant(): AppVariant {
  const variant = Constants.expoConfig?.extra?.appVariant;

  if (variant === 'preview' || variant === 'production') {
    return variant;
  }

  return 'development';
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const theme = colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const appVariant = getAppVariant();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView
        accessibilityLabel="Liqi Match project readiness screen"
        style={styles.safeArea}
      >
        <View
          accessibilityLabel="Project status"
          style={[
            styles.panel,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            Liqi Match
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Expo SDK 56 project is ready
          </Text>
          <Text style={[styles.caption, { color: theme.primary }]}>
            Environment: {appVariant}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
  },
  caption: {
    ...typography.caption,
    textAlign: 'center',
  },
});
