import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

/** Web popup landing surface. Auth runtime completes and closes the session. */
export default function OAuthCallbackScreen() {
  return (
    <View accessibilityLabel="Đang hoàn tất đăng nhập" style={styles.root}>
      <ActivityIndicator color={liquidColors.text.primary} />
      <Text style={styles.text}>Đang hoàn tất đăng nhập an toàn…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: liquidColors.background.base,
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  text: { color: liquidColors.text.primary, fontSize: 14 },
});
