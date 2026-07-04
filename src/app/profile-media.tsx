import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { completeOnboardingProfile } from '@/features/onboarding/profile-service';
import { getOnboardingSnapshot } from '@/features/onboarding/onboarding-store';
import { useAuth } from '@/shared/auth/auth-context';

export default function ProfileMediaScreen() {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    if (!session) {
      router.replace('/');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await completeOnboardingProfile(session, getOnboardingSnapshot());
      router.replace('/home');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.step}>Step 5/5</Text>
      <Text style={styles.title}>Finish profile</Text>
      <Text style={styles.subtitle}>Save profile data to Supabase and enter the app.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable disabled={busy} onPress={finish} style={styles.cta}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.ctaText}>Create profile</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#050713', flex: 1, justifyContent: 'center', padding: 18 },
  step: { color: '#A8AFC6', fontWeight: '800' },
  title: { color: '#F7F8FF', fontSize: 28, fontWeight: '900', marginTop: 18 },
  subtitle: { color: '#A8AFC6', fontSize: 15, lineHeight: 22, marginTop: 8 },
  error: { color: '#FFD7E4', marginTop: 16 },
  cta: { alignItems: 'center', backgroundColor: '#8A4DFF', borderRadius: 20, marginTop: 28, padding: 17 },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
});
