import { Redirect, usePathname } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEffect, type PropsWithChildren } from 'react';

import {
  hydratePersistedOnboardingDraft,
  clearActivePersistedOnboardingDraft,
  onboardingStepFromPathname,
  recoverInterruptedOnboardingMediaQueue,
  resolveOnboardingStepAccess,
  usePersistedOnboardingDraftStore,
  type OnboardingStep,
} from '@/features/onboarding';
import { useAuth } from '@/shared/auth/auth-context';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

import type { AccessArea } from './access-policy';
import { appRoutes } from '../navigation/routes';

export type RouteAccessGateProps = PropsWithChildren<{
  area: AccessArea;
}>;

/**
 * Sole route orchestrator for auth, account-scoped draft hydration, onboarding
 * prerequisites, and completion. Screens only persist their step then navigate.
 */
export function RouteAccessGate({ area, children }: RouteAccessGateProps) {
  const { loading, session } = useAuth();
  const pathname = usePathname();
  const accountId = session?.user.id ?? null;
  const draftState = usePersistedOnboardingDraftStore();

  useEffect(() => {
    if (!accountId) {
      clearActivePersistedOnboardingDraft();
      return;
    }

    const current = usePersistedOnboardingDraftStore.getState();
    if (
      current.accountId === accountId &&
      (current.hydration === 'hydrating' || current.hydration === 'ready')
    ) {
      return;
    }

    clearActivePersistedOnboardingDraft();
    void hydrateAndRecover(accountId);
  }, [accountId]);

  const draftReady = Boolean(
    accountId &&
    draftState.accountId === accountId &&
    draftState.hydration === 'ready' &&
    draftState.envelope,
  );
  if (loading) return <RouteAccessLoading />;
  if (!session) {
    return area === 'public' ? (
      children
    ) : (
      <Redirect href={appRoutes.auth.login} />
    );
  }

  if (!draftReady) {
    if (
      draftState.hydration === 'error' &&
      draftState.accountId === accountId
    ) {
      return (
        <RouteAccessUnavailable
          onRetry={() => void hydrateAndRecover(session.user.id)}
        />
      );
    }
    return <RouteAccessLoading />;
  }

  const envelope = draftState.envelope!;
  const requestedStep = onboardingStepFromPathname(pathname);
  const onboardingAccess = resolveOnboardingStepAccess({
    envelope,
    requestedStep,
  });

  if (area === 'public') {
    return (
      <Redirect
        href={
          onboardingAccess.canLeaveOnboarding
            ? appRoutes.main.home
            : routeForOnboardingStep(onboardingAccess.currentStep)
        }
      />
    );
  }

  if (area === 'app') {
    return onboardingAccess.canLeaveOnboarding ? (
      children
    ) : (
      <Redirect href={routeForOnboardingStep(onboardingAccess.currentStep)} />
    );
  }

  if (onboardingAccess.canLeaveOnboarding) {
    return <Redirect href={appRoutes.main.home} />;
  }

  if (
    requestedStep &&
    onboardingAccess.redirectTarget &&
    onboardingAccess.redirectTarget !== 'home'
  ) {
    return (
      <Redirect
        href={routeForOnboardingStep(onboardingAccess.redirectTarget)}
      />
    );
  }

  return children;
}

async function hydrateAndRecover(accountId: string) {
  await hydratePersistedOnboardingDraft(accountId);
  const state = usePersistedOnboardingDraftStore.getState();
  if (
    state.accountId !== accountId ||
    state.hydration !== 'ready' ||
    !state.envelope
  ) {
    return;
  }

  try {
    await recoverInterruptedOnboardingMediaQueue();
  } catch {
    // persistenceError remains available while the hydrated draft stays usable.
  }
}

function routeForOnboardingStep(step: OnboardingStep) {
  if (step === 'rank') return appRoutes.onboarding.rank;
  if (step === 'lane') return appRoutes.onboarding.lane;
  if (step === 'hero_selection') return appRoutes.onboarding.heroSelection;
  if (step === 'habits') return appRoutes.onboarding.habits;
  if (step === 'profile_media') return appRoutes.onboarding.profileMedia;
  return appRoutes.onboarding.profileSetup;
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
