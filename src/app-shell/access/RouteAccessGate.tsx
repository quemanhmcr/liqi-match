import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { PropsWithChildren } from 'react';

import { hasCompletedOnboarding } from '@/features/onboarding';
import { useAuth } from '@/shared/auth/auth-context';
import { queryKeys } from '@/shared/lib/query-keys';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

import { resolveAccess, type AccessArea } from './access-policy';
import { appRoutes } from '../navigation/routes';

export type RouteAccessGateProps = PropsWithChildren<{
  area: AccessArea;
}>;

/**
 * Centralizes session/onboarding routing so direct links follow the same
 * policy as an OAuth return. The preview uses the public policy: anonymous
 * users may view it, while authenticated users return to their Home context.
 */
export function RouteAccessGate({ area, children }: RouteAccessGateProps) {
  const { loading, session } = useAuth();
  const shouldCheckCompletion = area !== 'public' && Boolean(session);
  const completionQuery = useQuery({
    enabled: shouldCheckCompletion,
    queryFn: () => {
      if (!session) throw new Error('Missing authenticated session');
      return hasCompletedOnboarding(session);
    },
    queryKey: queryKeys.onboardingCompletion(session?.user.id ?? 'anonymous'),
    retry: 1,
    staleTime: 5 * 60_000,
  });

  if (loading || (shouldCheckCompletion && completionQuery.isLoading)) {
    return <RouteAccessLoading />;
  }

  if (shouldCheckCompletion && completionQuery.isError) {
    return (
      <RouteAccessUnavailable onRetry={() => void completionQuery.refetch()} />
    );
  }

  const decision = resolveAccess({
    area,
    hasCompletedOnboarding: completionQuery.data,
    hasSession: Boolean(session),
  });

  if (decision === 'to-login') return <Redirect href={appRoutes.auth.login} />;
  if (decision === 'to-home') return <Redirect href={appRoutes.main.home} />;
  if (decision === 'to-onboarding') {
    return <Redirect href={appRoutes.onboarding.profileSetup} />;
  }

  return children;
}

function RouteAccessLoading() {
  return (
    <View accessibilityLabel="Đang kiểm tra phiên" style={styles.centered}>
      <ActivityIndicator color={liquidColors.text.primary} />
    </View>
  );
}

function RouteAccessUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <View
      accessibilityLabel="Không thể kiểm tra trạng thái tài khoản"
      style={styles.centered}
    >
      <Text style={styles.title}>Chưa thể mở không gian của bạn</Text>
      <Text style={styles.body}>
        Kiểm tra kết nối rồi thử lại để bảo vệ trạng thái hồ sơ của bạn.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={styles.retry}
      >
        <Text style={styles.retryText}>Thử lại</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    color: 'rgba(220,226,248,0.64)',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    maxWidth: 288,
    textAlign: 'center',
  },
  centered: {
    alignItems: 'center',
    backgroundColor: liquidColors.background.base,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  retry: {
    backgroundColor: 'rgba(157,82,255,0.25)',
    borderColor: 'rgba(214,181,255,0.36)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: '#F8F4FF', fontSize: 13, fontWeight: '700' },
  title: { color: liquidColors.text.primary, fontSize: 17, fontWeight: '700' },
});
