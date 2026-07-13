import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export function DiscoverQueryState({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry: () => void;
}) {
  if (!error) {
    return (
      <View accessibilityLabel="Đang tải Khám phá" style={styles.screen}>
        <ActivityIndicator color="#C995FF" size="large" />
        <Text style={styles.title}>Đang tải Khám phá</Text>
      </View>
    );
  }

  return (
    <View accessibilityLabel="Không thể tải Khám phá" style={styles.screen}>
      <Text style={styles.title}>Không thể tải Khám phá</Text>
      <Text style={styles.description}>
        Dữ liệu chưa sẵn sàng. Nội dung mô phỏng sẽ không được dùng để che lỗi
        này.
      </Text>
      <Pressable
        accessibilityLabel="Thử tải lại Khám phá"
        onPress={onRetry}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonText}>Thử lại</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'rgba(168,100,255,0.24)',
    borderColor: 'rgba(212,176,255,0.46)',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  buttonPressed: { opacity: 0.72 },
  buttonText: { color: '#F7F2FF', fontSize: 14, fontWeight: '700' },
  description: {
    color: 'rgba(224,230,248,0.72)',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 300,
    textAlign: 'center',
  },
  screen: {
    alignItems: 'center',
    backgroundColor: '#040814',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  title: { color: '#F7F8FF', fontSize: 18, fontWeight: '800' },
});
