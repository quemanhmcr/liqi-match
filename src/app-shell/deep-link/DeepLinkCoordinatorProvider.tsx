import { Platform } from 'react-native';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';

import { useAuth } from '@/shared/auth/auth-context';

import { processPendingDeepLinkIntent } from './deep-link-coordinator';
import { NotificationResponseBridge } from './notifications/notification-response-bridge';
import { PersistedDeepLinkIntentStore } from './persisted-deep-link-intent-store';
import { createExpoNotificationResponseSource } from './notifications/expo-notification-response-source';
import { ApiNotificationDeepLinkResolver } from './notification-deep-link-resolver';

export type DeepLinkCoordinatorProviderProps = Readonly<{
  children: ReactNode;
}>;

const pendingIntentStore = new PersistedDeepLinkIntentStore();
const notificationResolver = new ApiNotificationDeepLinkResolver();
const transientRetryMs = 5_000;

export function DeepLinkCoordinatorProvider({
  children,
}: DeepLinkCoordinatorProviderProps) {
  const { session } = useAuth();
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const processingRef = useRef(false);
  const navigation = useMemo(
    () => ({
      push: router.push,
      replace: router.replace,
    }),
    [router.push, router.replace],
  );

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const bridge = new NotificationResponseBridge({
      onIntentEnqueued: () => setRevision((value) => value + 1),
      source: createExpoNotificationResponseSource(),
      store: pendingIntentStore,
    });
    void bridge.start().catch((error: unknown) => {
      console.error('Failed to start notification response bridge.', error);
    });
    return () => bridge.stop();
  }, []);

  useEffect(() => {
    if (!session || processingRef.current) return undefined;

    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    processingRef.current = true;

    void processPendingDeepLinkIntent({
      navigation,
      resolver: notificationResolver,
      session,
      store: pendingIntentStore,
    })
      .then((result) => {
        if (!active || result.kind !== 'retry') return;
        retryTimer = setTimeout(
          () => setRevision((value) => value + 1),
          result.retryAfterMs,
        );
      })
      .catch((error: unknown) => {
        console.error('Failed to process pending deep-link intent.', error);
        if (!active) return;
        retryTimer = setTimeout(
          () => setRevision((value) => value + 1),
          transientRetryMs,
        );
      })
      .finally(() => {
        processingRef.current = false;
      });

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [navigation, revision, session]);

  return children;
}
