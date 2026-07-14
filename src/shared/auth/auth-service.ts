import { createRetryableLazyModuleLoader } from '@/shared/runtime/retryable-lazy-module';

import type { AuthSession, OAuthProvider } from './auth-session';

export { AuthError } from './auth-errors';
export type {
  AuthSession,
  AuthoritativeAuthSession,
  OAuthProvider,
  SupabaseUser,
} from './auth-session';

const REFRESH_SKEW_SECONDS = 60;

type AuthRuntime = typeof import('./supabase-auth-runtime');
const loadRuntime = createRetryableLazyModuleLoader<AuthRuntime>(
  () => import('./supabase-auth-runtime'),
);

export async function signInWithOAuthProvider(
  provider: OAuthProvider,
): Promise<AuthSession> {
  return (await loadRuntime()).signInWithOAuthProvider(provider);
}

export async function restoreAuthSession(): Promise<AuthSession | null> {
  return (await loadRuntime()).restoreAuthSession();
}

export async function synchronizeAuthSession(): Promise<AuthSession | null> {
  return (await loadRuntime()).synchronizeAuthSession();
}

export async function refreshAuthSession(
  _legacyRefreshToken?: string,
): Promise<AuthSession | null> {
  return (await loadRuntime()).refreshAuthSession();
}

export async function signOutSession(
  _session: AuthSession | null,
): Promise<void> {
  await (await loadRuntime()).signOutSession();
}

export async function getValidAccessToken(
  minimumValiditySeconds = REFRESH_SKEW_SECONDS,
): Promise<string | null> {
  return (await loadRuntime()).getValidAccessToken(minimumValiditySeconds);
}

export function subscribeAuthSession(
  listener: (session: AuthSession | null) => void,
): () => void {
  let active = true;
  let unsubscribe: () => void = () => undefined;
  void loadRuntime()
    .then((runtime) => {
      if (!active) return;
      unsubscribe = runtime.subscribeAuthSession(listener);
    })
    .catch(() => undefined);
  return () => {
    active = false;
    unsubscribe();
  };
}

export function subscribeAccessToken(
  listener: (accessToken: string | null) => void,
): () => void {
  let active = true;
  let unsubscribe: () => void = () => undefined;
  void loadRuntime()
    .then((runtime) => {
      if (!active) return;
      unsubscribe = runtime.subscribeAccessToken(listener);
    })
    .catch(() => undefined);
  return () => {
    active = false;
    unsubscribe();
  };
}

export function shouldRefresh(session: AuthSession): boolean {
  return (
    session.expiresAt - Math.floor(Date.now() / 1000) <= REFRESH_SKEW_SECONDS
  );
}
