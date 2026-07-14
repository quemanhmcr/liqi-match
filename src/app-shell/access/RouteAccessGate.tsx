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
  clearActivePersistedOnboardingDraft,
  hydratePersistedOnboardingDraft,
  onboardingStepFromPathname,
  recoverInterruptedOnboardingMediaQueue,
  resolveOnboardingStepAccess,
  usePersistedOnboardingDraftStore,
  type OnboardingStep,
} from '@/features/onboarding';
import { useAuth } from '@/shared/auth/auth-context';
import { env } from '@/shared/config/env';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

import {
  resolvePlayerAccessMode,
  type AccessArea,
  type PlayerAccessMode,
} from './access-policy';
import { appRoutes } from '../navigation/routes';

export type RouteAccessGateProps = PropsWithChildren<{
  area: AccessArea;
}>;

/**
 * Sole route orchestrator for auth, authoritative lifecycle, and local
 * onboarding resume state. Local draft fields never grant application access.
 */
export function RouteAccessGate({ area, children }: RouteAccessGateProps) {
  const { loading, session } = useAuth();
  const pathname = usePathname();
  const draftState = usePersistedOnboardingDraftStore();
  const authorityValid = Boolean(
    session?.principal &&
    session.lifecycle &&
    session.principal.accountId === session.user.id &&
    session.principal.playerId === session.lifecycle.playerId,
  );
  const authorityPartiallyPresent = Boolean(
    session?.principal || session?.lifecycle,
  );
  const accessMode: PlayerAccessMode = authorityPartiallyPresent
    ? authorityValid
      ? resolvePlayerAccessMode({
          lifecycleState: session!.lifecycle!.state,
          runtimeMode: env.EXPO_PUBLIC_APPLICATION_RUNTIME_MODE,
        })
      : 'unavailable'
    : resolvePlayerAccessMode({
        lifecycleState: null,
        runtimeMode: env.EXPO_PUBLIC_APPLICATION_RUNTIME_MODE,
      });
  const accountId = authorityValid
    ? session!.principal!.accountId
    : accessMode === 'legacy_simulation'
      ? (session?.user.id ?? null)
      : null;
  const requestedStep = onboardingStepFromPathname(pathname);
  const preserveActiveFinalStep = Boolean(
    accessMode === 'active' &&
    area === 'onboarding' &&
    requestedStep === 'profile_media' &&
    accountId &&
    draftState.accountId === accountId &&
    draftState.hydration === 'ready' &&
    draftState.envelope &&
    draftState.envelope.status !== 'completed',
  );
  const needsDraft =
    accessMode === 'onboarding' ||
    accessMode === 'legacy_simulation' ||
    preserveActiveFinalStep;

  useEffect(() => {
    if (!accountId || !needsDraft) {
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
  }, [accountId, needsDraft]);

  if (loading) return <RouteAccessLoading />;
  if (!session) {
    return area === 'public' ? (
      children
    ) : (
      <Redirect href={appRoutes.auth.login} />
    );
  }

  if (accessMode === 'active') {
    if (preserveActiveFinalStep) return children;
    return area === 'app' ? children : <Redirect href={appRoutes.main.home} />;
  }
  if (accessMode === 'suspended') {
    return (
      <RouteLifecycleStatus
        accessibilityLabel="Tài khoản đang bị tạm ngưng"
        body="Tài khoản này hiện không thể được khám phá hoặc nhắn tin."
        title="Tài khoản đã bị tạm ngưng"
      />
    );
  }
  if (accessMode === 'deleting') {
    return (
      <RouteLifecycleStatus
        accessibilityLabel="Đang xóa tài khoản"
        body="Yêu cầu xóa đang được xử lý. Các deep link đã được vô hiệu hóa."
        title="Đang xóa tài khoản"
      />
    );
  }
  if (accessMode === 'deleted') {
    return (
      <RouteLifecycleStatus
        accessibilityLabel="Tài khoản đã được xóa"
        body="Phiên này không còn quyền truy cập nội dung đã xác thực."
        title="Tài khoản đã được xóa"
      />
    );
  }
  if (accessMode === 'unavailable' || !accountId) {
    return (
      <RouteLifecycleStatus
        accessibilityLabel="Không thể xác minh player"
        body="Ứng dụng chưa nhận được canonical identity và lifecycle từ server."
        title="Chưa thể xác minh tài khoản"
      />
    );
  }

  const draftReady = Boolean(
    draftState.accountId === accountId &&
    draftState.hydration === 'ready' &&
    draftState.envelope,
  );
  if (!draftReady) {
    if (
      draftState.hydration === 'error' &&
      draftState.accountId === accountId
    ) {
      return (
        <RouteAccessUnavailable
          onRetry={() => void hydrateAndRecover(accountId)}
        />
      );
    }
    return <RouteAccessLoading />;
  }

  const envelope = draftState.envelope!;
  const onboardingAccess = resolveOnboardingStepAccess({
    envelope,
    requestedStep,
  });

  if (accessMode === 'legacy_simulation') {
    return renderLegacySimulationAccess({
      area,
      children,
      onboardingAccess,
      requestedStep,
    });
  }

  // Production onboarding: a stale local "completed" marker means retry the
  // authoritative command from the final step, never grant Home access.
  const resumeStep = onboardingAccess.canLeaveOnboarding
    ? 'profile_media'
    : onboardingAccess.currentStep;
  if (area === 'public' || area === 'app') {
    return <Redirect href={routeForOnboardingStep(resumeStep)} />;
  }
  if (onboardingAccess.canLeaveOnboarding) {
    return requestedStep === 'profile_media' ? (
      children
    ) : (
      <Redirect href={appRoutes.onboarding.profileMedia} />
    );
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

function renderLegacySimulationAccess({
  area,
  children,
  onboardingAccess,
  requestedStep,
}: {
  area: AccessArea;
  children: React.ReactNode;
  onboardingAccess: ReturnType<typeof resolveOnboardingStepAccess>;
  requestedStep: OnboardingStep | null | undefined;
}) {
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

function RouteLifecycleStatus({
  accessibilityLabel,
  body,
  title,
}: {
  accessibilityLabel: string;
  body: string;
  title: string;
}) {
  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.centered}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
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
