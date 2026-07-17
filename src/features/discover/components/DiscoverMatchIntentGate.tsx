import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  isMatchIntentActive,
  matchIntentFiltersForMood,
  useActivateMatchIntentMutation,
  useCurrentMatchIntentQuery,
} from '@/entities/match-intent';
import { env } from '@/shared/config/env';
import {
  LiquidButton,
  LiquidCard,
  LiquidGlassSurface,
} from '@/shared/components/liquid';
import { LiquidScreen } from '@/shared/layouts/LiquidScreen';

export function DiscoverMatchIntentGate({ children }: PropsWithChildren) {
  const currentQuery = useCurrentMatchIntentQuery();
  const activateMutation = useActivateMatchIntentMutation();
  const snapshot = currentQuery.data ?? null;

  if (
    env.EXPO_PUBLIC_APPLICATION_RUNTIME_MODE !== 'api' ||
    isMatchIntentActive(snapshot)
  ) {
    return children;
  }

  const activate = () => {
    activateMutation.mutate(
      {
        ...(snapshot ? { expectedVersion: snapshot.version } : {}),
        filters: matchIntentFiltersForMood('setlove'),
      },
      { onError: () => void currentQuery.refetch() },
    );
  };

  return (
    <LiquidScreen contentContainerStyle={styles.screen} withHeader={false}>
      <View style={styles.gate} testID="discover-match-intent-gate">
        <LinearGradient
          colors={[
            'rgba(116,72,255,0.24)',
            'rgba(47,203,255,0.07)',
            'transparent',
          ]}
          pointerEvents="none"
          style={styles.glow}
        />
        <LiquidCard
          blurIntensity={34}
          contentStyle={styles.card}
          glowIntensity="medium"
          radius={30}
          style={styles.cardFrame}
          variant="purple"
          withInnerReflection
          withShadow={false}
        >
          <LiquidGlassSurface
            contentStyle={styles.iconSurface}
            glowIntensity="medium"
            height={68}
            radius={34}
            surfaceBackground="rgba(113,72,255,0.20)"
            variant="button"
            width={68}
            withShadow={false}
          >
            <Ionicons color="#E4D4FF" name="sparkles" size={30} />
          </LiquidGlassSurface>
          <View style={styles.copy}>
            <Text accessibilityRole="header" style={styles.title}>
              Bật trạng thái để bắt đầu khám phá
            </Text>
            <Text style={styles.description}>
              LIQI dùng mood đang bật để tìm người phù hợp và giữ kết quả nhất
              quán giữa Trang chủ với Khám phá.
            </Text>
          </View>
          {currentQuery.isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#C8A7FF" />
              <Text style={styles.loadingText}>Đang kiểm tra trạng thái…</Text>
            </View>
          ) : (
            <LiquidButton
              accessibilityLabel="Bật trạng thái Set Love và bắt đầu khám phá"
              disabled={activateMutation.isPending}
              onPress={activate}
              style={styles.action}
              variant="primary"
            >
              {activateMutation.isPending ? 'Đang bật…' : 'Bật Set Love'}
            </LiquidButton>
          )}
          {currentQuery.error || activateMutation.error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              Trạng thái vừa được cập nhật ở nơi khác hoặc kết nối đang gián
              đoạn. Hãy thử lại.
            </Text>
          ) : null}
          <Text style={styles.hint}>
            Bạn có thể đổi mood hoặc tắt trạng thái bất cứ lúc nào ở Trang chủ.
          </Text>
        </LiquidCard>
      </View>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  action: { alignSelf: 'stretch', marginTop: 4 },
  card: { alignItems: 'center', gap: 16, padding: 24 },
  cardFrame: { width: '100%', maxWidth: 430 },
  copy: { alignItems: 'center', gap: 9 },
  description: {
    color: 'rgba(222,229,249,0.72)',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  error: {
    color: '#FFB9C5',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  gate: { alignItems: 'center', width: '100%' },
  glow: {
    height: 320,
    left: -80,
    position: 'absolute',
    right: -80,
    top: 48,
  },
  hint: {
    color: 'rgba(190,201,232,0.52)',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  iconSurface: { alignItems: 'center', justifyContent: 'center' },
  loadingRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  loadingText: { color: 'rgba(222,229,249,0.72)', fontSize: 13 },
  screen: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    color: '#F8F7FF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.35,
    lineHeight: 28,
    textAlign: 'center',
  },
});
