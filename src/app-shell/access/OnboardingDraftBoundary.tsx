import { useEffect, type PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/shared/auth/auth-context';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

import {
  clearActivePersistedOnboardingDraft,
  hydratePersistedOnboardingDraft,
  recoverInterruptedOnboardingMediaQueue,
  usePersistedOnboardingDraftStore,
} from '@/features/onboarding';

export function OnboardingDraftBoundary({ children }: PropsWithChildren) {
  const { loading, session } = useAuth();
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

  if (loading || !accountId) return children;

  const isReady =
    draftState.accountId === accountId &&
    draftState.hydration === 'ready' &&
    Boolean(draftState.envelope);
  if (isReady) return children;

  if (draftState.accountId === accountId && draftState.hydration === 'error') {
    return (
      <View
        accessibilityLabel="Không thể khôi phục tiến độ onboarding"
        style={styles.centered}
      >
        <Text style={styles.title}>Chưa thể khôi phục tiến độ</Text>
        <Text style={styles.body}>
          Dữ liệu hiện tại chưa bị xoá. Hãy thử đọc lại bản nháp của tài khoản
          này.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void hydrateAndRecover(accountId);
          }}
          style={styles.retry}
        >
          <Text style={styles.retryText}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      accessibilityLabel="Đang khôi phục tiến độ onboarding"
      style={styles.centered}
    >
      <ActivityIndicator color={liquidColors.text.primary} />
    </View>
  );
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
    // The persisted store exposes persistenceError; keep the hydrated draft visible.
  }
}

const styles = StyleSheet.create({
  body: {
    color: 'rgba(220,226,248,0.64)',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    maxWidth: 300,
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
