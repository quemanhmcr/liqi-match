import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { updateOnboardingSnapshot } from '@/features/onboarding/onboarding-store';

const lanes = [
  ['slayer', 'Đường Tà thần'],
  ['jungle', 'Đi rừng'],
  ['mid', 'Đường giữa'],
  ['dragon', 'Đường Rồng'],
  ['support', 'Trợ thủ'],
] as const;

export default function LaneSelectionScreen() {
  const [selected, setSelected] = useState<string[]>(['jungle']);

  const toggleLane = (id: string) => {
    setSelected((current) => {
      if (current.includes(id))
        return current.length === 1
          ? current
          : current.filter((item) => item !== id);
      if (current.length >= 2) return [current[0]!, id];
      return [...current, id];
    });
  };

  const submit = () => {
    updateOnboardingSnapshot({ laneIds: selected });
    router.push('/hero-selection');
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#090B1A', '#040817', '#01040C']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe}>
        <Text style={styles.step}>Bước 2/5</Text>
        <Text style={styles.title}>Chọn lane của bạn</Text>
        <Text style={styles.subtitle}>
          Chọn tối đa 2 lane. Lane đầu tiên là ưu tiên chính.
        </Text>
        <View style={styles.list}>
          {lanes.map(([id, name]) => (
            <Pressable
              key={id}
              onPress={() => toggleLane(id)}
              style={[styles.row, selected.includes(id) && styles.rowActive]}
            >
              <Text style={styles.rowText}>{name}</Text>
              {selected[0] === id ? (
                <Text style={styles.primary}>Ưu tiên</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
        <Text style={styles.count}>Đã chọn {selected.length}/2</Text>
        <Pressable onPress={submit} style={styles.cta}>
          <Text style={styles.ctaText}>Tiếp tục</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#020611', flex: 1 },
  safe: { flex: 1, padding: 18 },
  step: { color: '#A8AFC6', fontWeight: '800', marginTop: 8 },
  title: { color: '#F7F8FF', fontSize: 28, fontWeight: '900', marginTop: 18 },
  subtitle: { color: '#A8AFC6', fontSize: 15, lineHeight: 22, marginTop: 8 },
  list: { gap: 12, marginTop: 24 },
  row: {
    alignItems: 'center',
    backgroundColor: 'rgba(16,23,45,0.92)',
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 18,
  },
  rowActive: { borderColor: '#B44CFF', borderWidth: 1 },
  rowText: { color: '#F7F8FF', fontSize: 16, fontWeight: '800' },
  primary: { color: '#D08BFF', fontSize: 12, fontWeight: '900' },
  count: { color: '#A8AFC6', marginTop: 20, textAlign: 'center' },
  cta: {
    alignItems: 'center',
    backgroundColor: '#8A4DFF',
    borderRadius: 20,
    marginTop: 'auto',
    padding: 17,
  },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
});
