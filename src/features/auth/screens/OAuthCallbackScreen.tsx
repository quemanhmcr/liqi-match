import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { liqiColors } from '@/shared/theme/liqi-design-system';

/** Web popup landing surface. Auth runtime completes and closes the session. */
export default function OAuthCallbackScreen() {
  return (
    <View accessibilityLabel="Đang hoàn tất đăng nhập" style={styles.root}>
      <ActivityIndicator color={liqiColors.text.primary} />
      <Text style={styles.text}>Đang hoàn tất đăng nhập an toàn…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: liqiColors.background.base,
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  text: { color: liqiColors.text.primary, fontSize: 14 },
});
