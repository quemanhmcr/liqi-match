import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { updateOnboardingSnapshot } from '@/features/onboarding/onboarding-store';

const ranks = [
  ['bronze', 'Đồng'],
  ['silver', 'Bạc'],
  ['gold', 'Vàng'],
  ['platinum', 'Bạch Kim'],
  ['diamond', 'Kim Cương'],
  ['veteran', 'Tinh Anh'],
  ['master', 'Cao Thủ'],
  ['grandmaster-iv', 'Đại Cao Thủ IV'],
  ['grandmaster-iii', 'Đại Cao Thủ III'],
  ['grandmaster-ii', 'Đại Cao Thủ II'],
  ['grandmaster-i', 'Đại Cao Thủ I'],
  ['conqueror', 'Chiến Tướng'],
  ['legendary', 'Chiến Thần'],
] as const;

export default function RankSelectionScreen() {
  const [selected, setSelected] = useState('master');

  const submit = () => {
    updateOnboardingSnapshot({ rankId: selected });
    router.push('/lane');
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#080B19', '#030714', '#01040C']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <Text style={styles.step}>Bước 1/5</Text>
        <Text style={styles.title}>Chọn mức rank hiện tại</Text>
        <Text style={styles.subtitle}>Rank càng chuẩn, đề xuất đồng đội càng khớp.</Text>
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {ranks.map(([id, name]) => (
            <Pressable key={id} onPress={() => setSelected(id)} style={[styles.row, selected === id && styles.rowActive]}>
              <Text style={styles.rowText}>{name}</Text>
              {selected === id ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          ))}
        </ScrollView>
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
  subtitle: { color: '#A8AFC6', fontSize: 15, marginTop: 8 },
  list: { gap: 10, paddingVertical: 18 },
  row: { alignItems: 'center', backgroundColor: 'rgba(16,23,45,0.92)', borderRadius: 18, flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  rowActive: { borderColor: '#B44CFF', borderWidth: 1 },
  rowText: { color: '#F7F8FF', fontSize: 16, fontWeight: '800' },
  check: { color: '#D08BFF', fontSize: 18, fontWeight: '900' },
  cta: { alignItems: 'center', backgroundColor: '#8A4DFF', borderRadius: 20, padding: 17 },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
});
