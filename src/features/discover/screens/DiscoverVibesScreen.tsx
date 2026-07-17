import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { env } from '@/shared/config/env';

import { DiscoverCollectionScreen } from '../components/DiscoverCollectionScreen';

export function DiscoverVibesScreen() {
  return env.EXPO_PUBLIC_APPLICATION_RUNTIME_MODE === 'api' ? (
    <DeferredVibeDiscoveryScreen />
  ) : (
    <DiscoverCollectionScreen kind="vibes" />
  );
}

export function DeferredVibeDiscoveryScreen() {
  const router = useRouter();
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Quay lại"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons color="#F4F6FF" name="chevron-back" size={22} />
        </Pressable>
        <Text style={styles.headerTitle}>Vibe</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.iconShell}>
          <Ionicons color="#AEB8FF" name="sparkles-outline" size={28} />
        </View>
        <Text style={styles.title}>Vibe discovery chưa bật trong v1</Text>
        <Text style={styles.body}>
          Production Match Loop v1 tập trung vào người chơi và đội ổn định. Vibe
          sẽ được mở khi dữ liệu và hành động đã sẵn sàng riêng.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  body: {
    color: 'rgba(223, 227, 245, 0.66)',
    lineHeight: 22,
    maxWidth: 330,
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    padding: 28,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerTitle: { color: '#F7F8FF', fontSize: 20, fontWeight: '700' },
  iconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(94, 108, 255, 0.14)',
    borderRadius: 24,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  safeArea: { backgroundColor: '#0B0E19', flex: 1 },
  title: {
    color: '#F7F8FF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
});
