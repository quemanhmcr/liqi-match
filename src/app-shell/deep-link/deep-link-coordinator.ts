import type { Href } from 'expo-router';

import { appRoutes } from '@/app-shell/navigation/routes';
import type { AuthSession } from '@/shared/auth/auth-service';

import type { NotificationDeepLinkResolver } from './notification-deep-link-resolver';
import type { PersistedDeepLinkIntentStore } from './persisted-deep-link-intent-store';
import { routeForDeepLinkV1 } from './deep-link-route';

export type DeepLinkNavigation = Readonly<{
  push(destination: Href): void;
  replace(destination: Href): void;
}>;

export type ProcessPendingDeepLinkResult =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'navigated'; intentId: string }>
  | Readonly<{ kind: 'safe-fallback'; intentId: string }>
  | Readonly<{
      intentId: string;
      kind: 'retry';
      retryAfterMs: number;
    }>;

export type ProcessPendingDeepLinkInput = Readonly<{
  leaseDurationMs?: number;
  navigation: DeepLinkNavigation;
  now?: () => Date;
  resolver: NotificationDeepLinkResolver;
  session: AuthSession | null;
  store: PersistedDeepLinkIntentStore;
}>;

const defaultLeaseDurationMs = 30_000;
const providerRetryMs = 5_000;
const lifecycleRetryMs = 15_000;
const targetRetryMs = 2_000;

export async function processPendingDeepLinkIntent(
  input: ProcessPendingDeepLinkInput,
): Promise<ProcessPendingDeepLinkResult> {
  if (!input.session) return { kind: 'idle' };

  const now = input.now?.() ?? new Date();
  const intent = await input.store.claim({
    leaseDurationMs: input.leaseDurationMs ?? defaultLeaseDurationMs,
    now: now.toISOString(),
  });
  if (!intent) return { kind: 'idle' };

  try {
    if (
      intent.source !== 'notification-response' ||
      !intent.notificationId ||
      !intent.sourceEventId
    ) {
      input.navigation.replace(appRoutes.main.home);
      await input.store.complete(intent.intentId);
      return { intentId: intent.intentId, kind: 'safe-fallback' };
    }

    const resolution = await input.resolver.resolve({
      notificationId: intent.notificationId,
      session: input.session,
      sourceEventId: intent.sourceEventId,
    });

    switch (resolution.status) {
      case 'available':
        if (!resolution.deepLink) {
          throw new Error('Available deep-link resolution has no destination.');
        }
        input.navigation.push(routeForDeepLinkV1(resolution.deepLink));
        await input.store.complete(intent.intentId);
        return { intentId: intent.intentId, kind: 'navigated' };
      case 'defer_lifecycle':
        await input.store.release(intent.intentId);
        return {
          intentId: intent.intentId,
          kind: 'retry',
          retryAfterMs: lifecycleRetryMs,
        };
      case 'defer_target':
        await input.store.release(intent.intentId);
        return {
          intentId: intent.intentId,
          kind: 'retry',
          retryAfterMs: targetRetryMs,
        };
      case 'provider_unavailable':
        await input.store.release(intent.intentId);
        return {
          intentId: intent.intentId,
          kind: 'retry',
          retryAfterMs: providerRetryMs,
        };
      case 'disabled':
      case 'expired':
      case 'not_found':
      case 'player_unavailable':
        input.navigation.replace(appRoutes.main.home);
        await input.store.complete(intent.intentId);
        return { intentId: intent.intentId, kind: 'safe-fallback' };
    }
  } catch (error) {
    await input.store.release(intent.intentId);
    throw error;
  }
}
