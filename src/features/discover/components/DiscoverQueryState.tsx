import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { classifyApplicationError } from '@/shared/errors/application-error';

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

  const presentation = classifyApplicationError(error);
  const description =
    presentation.kind === 'offline'
      ? 'Thiết bị đang offline. Kết nối lại để tải dữ liệu Khám phá.'
      : presentation.retryable
        ? 'Dữ liệu tạm thời chưa sẵn sàng. Hãy thử lại.'
        : 'Yêu cầu không thể hoàn tất. Ứng dụng không dùng dữ liệu mô phỏng để che lỗi này.';

  return (
    <View accessibilityLabel="Không thể tải Khám phá" style={styles.screen}>
      <Text style={styles.title}>Không thể tải Khám phá</Text>
      <Text style={styles.description}>{description}</Text>
      {presentation.retryable ? (
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
      ) : null}
    </View>
  );
}

export function DiscoverStaleBanner() {
  return (
    <View
      accessibilityLabel="Khám phá đang hiển thị dữ liệu cũ"
      style={styles.staleBanner}
    >
      <Text style={styles.staleText}>
        Không thể làm mới. Đang hiển thị dữ liệu Khám phá đã tải gần nhất.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  staleBanner: {
    backgroundColor: 'rgba(255,184,107,0.09)',
    borderColor: 'rgba(255,184,107,0.18)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 20,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  staleText: {
    color: 'rgba(255,226,190,0.78)',
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
  },
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
