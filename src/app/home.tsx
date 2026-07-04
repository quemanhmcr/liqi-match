import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#050713', '#070B18', '#050713']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>HỒ SƠ ĐÃ LƯU</Text>
          <Text style={styles.title}>Chào mừng đến Liqi Match</Text>
          <Text style={styles.subtitle}>
            Bạn đã hoàn tất hồ sơ ghép đội. Trang chính sẽ dùng dữ liệu đã lưu
            để hiển thị đề xuất đồng đội, match và chat.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#050713', flex: 1 },
  safe: { flex: 1, justifyContent: 'center', padding: 18 },
  card: {
    backgroundColor: 'rgba(13,17,34,0.9)',
    borderRadius: 28,
    gap: 14,
    padding: 22,
  },
  eyebrow: {
    color: '#C679FF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: { color: '#F7F8FF', fontSize: 28, fontWeight: '900' },
  subtitle: { color: '#A8AFC6', fontSize: 15, lineHeight: 22 },
});
