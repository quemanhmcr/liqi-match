import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { updateOnboardingSnapshot } from '@/features/onboarding/onboarding-store';

const heroes = [
  ['edras', 'Edras'],
  ['goverra', 'Goverra'],
  ['heino', 'Heino'],
  ['billow', 'Billow'],
  ['dolia', 'Dolia'],
  ['laville', 'Laville'],
] as const;

export default function HeroSelectionScreen() {
  const [selected, setSelected] = useState<string[]>(['edras', 'goverra', 'heino']);

  const toggleHero = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return [current[1]!, current[2]!, id];
      return [...current, id];
    });
  };

  const submit = () => {
    if (selected.length !== 3) return;
    updateOnboardingSnapshot({ heroIds: selected });
    router.push('/habits');
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#090B1A', '#050713', '#050713']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <Text style={styles.step}>Step 3/5</Text>
        <Text style={styles.title}>Choose 3 favorite heroes</Text>
        <Text style={styles.subtitle}>Selected {selected.length}/3</Text>
        <View style={styles.list}>
          {heroes.map(([id, name]) => (
            <Pressable key={id} onPress={() => toggleHero(id)} style={[styles.row, selected.includes(id) && styles.rowActive]}>
              <Text style={styles.rowText}>{name}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable disabled={selected.length !== 3} onPress={submit} style={[styles.cta, selected.length !== 3 && styles.ctaDisabled]}>
          <Text style={styles.ctaText}>Continue</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#050713', flex: 1 },
  safe: { flex: 1, padding: 18 },
  step: { color: '#A8AFC6', fontWeight: '800', marginTop: 8 },
  title: { color: '#F7F8FF', fontSize: 28, fontWeight: '900', marginTop: 18 },
  subtitle: { color: '#A8AFC6', fontSize: 15, marginTop: 8 },
  list: { gap: 12, marginTop: 24 },
  row: { backgroundColor: 'rgba(16,23,45,0.92)', borderRadius: 16, padding: 16 },
  rowActive: { borderColor: '#B44CFF', borderWidth: 1 },
  rowText: { color: '#F7F8FF', fontSize: 16, fontWeight: '800' },
  cta: { alignItems: 'center', backgroundColor: '#8A4DFF', borderRadius: 20, marginTop: 'auto', padding: 17 },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
});
