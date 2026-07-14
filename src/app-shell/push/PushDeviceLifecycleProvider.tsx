import { AppState, Platform, type AppStateStatus } from 'react-native';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGlobalSearchParams, usePathname } from 'expo-router';

import { useAuth } from '@/shared/auth/auth-context';
import {
  ConversationIdSchema,
  type ConversationId,
} from '@/shared/contracts/core-v1';

import {
  notificationPresenceService,
  notificationPresentationController,
  pushDeviceRegistrationService,
} from './push-runtime';

export type PushDeviceLifecycleProviderProps = Readonly<{
  children: ReactNode;
}>;

type RegisteredDevice = Readonly<{
  accountId: string;
  deviceInstallationId: string;
  session: NonNullable<ReturnType<typeof useAuth>['session']>;
}>;

const foregroundHeartbeatMs = 45_000;
const retryRegistrationMs = 30_000;

export function PushDeviceLifecycleProvider({
  children,
}: PushDeviceLifecycleProviderProps) {
  const { session } = useAuth();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{
    conversationId?: string | string[];
  }>();
  const activeConversationId = useMemo(
    () => resolveActiveConversationId(pathname, params.conversationId),
    [params.conversationId, pathname],
  );
  const [registeredDevice, setRegisteredDevice] =
    useState<RegisteredDevice | null>(null);
  const registeredDeviceRef = useRef<RegisteredDevice | null>(null);
  const [registrationRevision, setRegistrationRevision] = useState(0);

  useEffect(() => {
    registeredDeviceRef.current = registeredDevice;
  }, [registeredDevice]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    notificationPresentationController.install();
  }, []);

  useEffect(() => {
    notificationPresentationController.setActiveConversation(
      activeConversationId,
    );
  }, [activeConversationId]);

  useEffect(() => {
    const currentAccountId = session?.user.id ?? null;
    const previous = registeredDeviceRef.current;
    if (!previous || previous.accountId === currentAccountId) return;

    setRegisteredDevice(null);
    void pushDeviceRegistrationService
      .unregister(previous.session)
      .catch((error: unknown) => {
        console.warn('Failed to unregister previous push installation.', error);
      });
  }, [session?.user.id]);

  useEffect(() => {
    if (!session || Platform.OS === 'web') return undefined;
    if (registeredDevice?.accountId === session.user.id) return undefined;

    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    void pushDeviceRegistrationService
      .ensureRegistered(session, controller.signal)
      .then((outcome) => {
        if (!active) return;
        if (outcome.kind === 'registered') {
          setRegisteredDevice({
            accountId: session.user.id,
            deviceInstallationId: outcome.deviceInstallationId,
            session,
          });
          return;
        }
        if (
          outcome.kind === 'missing-project-id' ||
          outcome.kind === 'unsupported-platform'
        ) {
          console.warn(`Push registration unavailable: ${outcome.kind}.`);
          return;
        }
        if (outcome.kind === 'principal-ineligible') return;
        if (outcome.kind === 'lifecycle-ineligible') return;
        if (outcome.kind === 'permission-denied') return;
        if (outcome.kind === 'not-physical-device') return;
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        console.warn('Push registration failed; scheduling retry.', error);
        retryTimer = setTimeout(
          () => setRegistrationRevision((value) => value + 1),
          retryRegistrationMs,
        );
      });

    return () => {
      active = false;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [registeredDevice?.accountId, registrationRevision, session]);

  useEffect(() => {
    if (!registeredDevice) return undefined;

    let active = true;
    let appState: AppStateStatus = AppState.currentState;
    let inFlight = false;
    const controller = new AbortController();

    const syncPresence = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        if (appState === 'active') {
          await notificationPresenceService.foreground({
            activeConversationId,
            deviceInstallationId: registeredDevice.deviceInstallationId,
            session: registeredDevice.session,
            signal: controller.signal,
          });
        } else {
          await notificationPresenceService.background({
            deviceInstallationId: registeredDevice.deviceInstallationId,
            session: registeredDevice.session,
            signal: controller.signal,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn('Failed to update notification presence.', error);
        }
      } finally {
        inFlight = false;
      }
    };

    void syncPresence();
    const heartbeat = setInterval(() => {
      if (appState === 'active') void syncPresence();
    }, foregroundHeartbeatMs);
    const subscription = AppState.addEventListener('change', (nextState) => {
      appState = nextState;
      void syncPresence();
    });

    return () => {
      active = false;
      controller.abort();
      clearInterval(heartbeat);
      subscription.remove();
      void notificationPresenceService
        .background({
          deviceInstallationId: registeredDevice.deviceInstallationId,
          session: registeredDevice.session,
        })
        .catch(() => undefined);
    };
  }, [activeConversationId, registeredDevice]);

  return children;
}

function resolveActiveConversationId(
  pathname: string,
  rawConversationId: string | string[] | undefined,
): ConversationId | null {
  if (!pathname.startsWith('/messages/')) return null;
  const value = Array.isArray(rawConversationId)
    ? rawConversationId[0]
    : rawConversationId;
  const parsed = ConversationIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
