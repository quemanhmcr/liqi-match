import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { updateOnboardingSnapshot } from '@/features/onboarding/onboarding-store';

const defaultHabits = {
  communication_channels: ['Voice when needed', 'Ping/chat first'],
  online_time_presets: ['Evening'],
  decision_style: 'Discuss before deciding',
  session_length: '3-5 games',
  team_goals: ['Rank climbing', 'Stable teammates'],
  seriousness: 'Balanced',
  strategy_styles: ['Objective control', 'Macro rotations'],
  team_atmospheres: ['Focused and respectful'],
  feedback_style: 'Short in-game feedback',
  loss_response: 'Short break after losses',
  comeback_response: 'Follow team decision',
};

export default function HabitsScreen() {
  const submit = () => {
    updateOnboardingSnapshot({ habits: defaultHabits });
    router.push('/profile-media');
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#050713', '#070B18', '#050713']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <Text style={styles.step}>Step 4/5</Text>
        <Text style={styles.title}>Team habits</Text>
        <Text style={styles.subtitle}>This first connected build saves a safe default habit profile so the end-to-end account flow can be tested.</Text>
        <View style={styles.card}>
          <Info label="Comms" value="Voice when needed" />
          <Info label="Online" value="Evening" />
          <Info label="Goal" value="Rank climbing" />
          <Info label="Mode" value="Balanced" />
        </View>
        <Pressable onPress={submit} style={styles.cta}>
          <Text style={styles.ctaText}>Continue</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#050713', flex: 1 },
  safe: { flex: 1, padding: 18 },
  step: { color: '#A8AFC6', fontWeight: '800', marginTop: 8 },
  title: { color: '#F7F8FF', fontSize: 28, fontWeight: '900', marginTop: 18 },
  subtitle: { color: '#A8AFC6', fontSize: 15, lineHeight: 22, marginTop: 8 },
  card: { backgroundColor: 'rgba(13,17,34,0.9)', borderRadius: 24, gap: 12, marginTop: 24, padding: 18 },
  info: { backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 16, padding: 14 },
  infoLabel: { color: '#798097', fontSize: 12, fontWeight: '800' },
  infoValue: { color: '#F7F8FF', fontSize: 15, fontWeight: '800', marginTop: 4 },
  cta: { alignItems: 'center', backgroundColor: '#8A4DFF', borderRadius: 20, marginTop: 'auto', padding: 17 },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
});
