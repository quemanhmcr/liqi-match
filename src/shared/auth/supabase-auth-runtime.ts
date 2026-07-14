import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import type { Session as SupabaseSession } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { AccountIdSchema } from '@/shared/contracts/core-v1';

import { AuthError } from './auth-errors';
import {
  parseAuthoritativePlayerContext,
  toAuthoritativeAuthSession,
  type AuthSession,
  type OAuthProvider,
} from './auth-session';
import { AuthSessionCoordinator } from './auth-session-coordinator';
import { emitAuthTelemetry } from './auth-telemetry';
import { validateOAuthCallback } from './oauth-callback';
import {
  clearPendingPkceVerifier,
  clearSupabaseAuthStorage,
  supabaseAuthClient,
} from './supabase-auth-client';

const LEGACY_ASYNC_STORAGE_KEY = '@liqi-match/auth-session-v1';
const REDIRECT_SCHEME = 'liqimatch';
const REDIRECT_PATH = 'auth/callback';
const coordinator = new AuthSessionCoordinator();

let initialization: Promise<void> | null = null;
let refreshRequest: Promise<AuthSession | null> | null = null;
let oauthRequest: Promise<AuthSession> | null = null;
let runtimeGeneration = 0;
let runtimeListenersInstalled = false;

try {
  WebBrowser.maybeCompleteAuthSession();
} catch {
  // The native auth session remains the authoritative callback channel.
}

function redirectUri(): string {
  return makeRedirectUri({
    native: `${REDIRECT_SCHEME}://${REDIRECT_PATH}`,
    path: REDIRECT_PATH,
    scheme: REDIRECT_SCHEME,
  });
}

function schedule(
  source: 'auth_event' | 'foreground',
  task: () => Promise<void>,
): void {
  void Promise.resolve()
    .then(task)
    .catch(async (error) => {
      emitAuthTelemetry(
        source === 'foreground'
          ? 'auth.foreground_sync.failed'
          : 'auth.session_event.failed',
        { code: errorCode(error) },
      );
      if (isTerminalSessionError(error)) await clearLocalSession();
    });
}

async function initialize(): Promise<void> {
  if (initialization === null) {
    const attempt = initializeOnce();
    initialization = attempt.catch((error) => {
      initialization = null;
      throw error;
    });
  }
  return initialization;
}

async function initializeOnce(): Promise<void> {
  emitAuthTelemetry('auth.restore.started');
  await removeLegacyAsyncStorageSession();
  installRuntimeListenersOnce();

  const { data, error } = await supabaseAuthClient.auth.getSession();
  if (error) {
    coordinator.clear();
    emitAuthTelemetry('auth.restore.failed', {
      code: error.code ?? 'unknown',
      retryable: isRetryableAuthFailure(error),
    });
    if (isRetryableAuthFailure(error)) {
      throw new AuthError(
        error.message || 'Không thể đọc phiên đăng nhập an toàn.',
        error.code ?? 'session_restore_failed',
        { cause: error },
      );
    }
    await clearLocalSession();
    return;
  }
  if (!data.session) {
    coordinator.clear();
    emitAuthTelemetry('auth.restore.succeeded', { hasSession: false });
    return;
  }

  try {
    await reconcile(data.session);
    emitAuthTelemetry('auth.restore.succeeded', { hasSession: true });
  } catch (error) {
    emitAuthTelemetry('auth.restore.failed', { code: errorCode(error) });
    if (isTerminalSessionError(error)) await clearLocalSession();
    else throw error;
  }
}

function installRuntimeListenersOnce(): void {
  if (runtimeListenersInstalled) return;
  runtimeListenersInstalled = true;

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabaseAuthClient.auth.startAutoRefresh();
      schedule('foreground', async () => {
        const { data, error } = await supabaseAuthClient.auth.getSession();
        if (error) {
          throw new AuthError(
            error.message || 'Không thể đồng bộ phiên đăng nhập.',
            error.code ?? 'session_sync_failed',
            { cause: error },
          );
        }
        if (data.session) await reconcile(data.session);
        else coordinator.clear();
      });
    } else {
      supabaseAuthClient.auth.stopAutoRefresh();
    }
  });

  if (AppState.currentState === 'active') {
    supabaseAuthClient.auth.startAutoRefresh();
  } else {
    supabaseAuthClient.auth.stopAutoRefresh();
  }

  supabaseAuthClient.auth.onAuthStateChange((event, session) => {
    // Never await network or another auth method under Supabase's auth lock.
    schedule('auth_event', async () => {
      if (event === 'SIGNED_OUT' || session === null) {
        runtimeGeneration += 1;
        coordinator.clear();
        return;
      }
      if (
        event !== 'USER_UPDATED' &&
        coordinator.getCurrent()?.accessToken === session.access_token
      ) {
        return;
      }
      await reconcile(session);
    });
  });
}

async function removeLegacyAsyncStorageSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LEGACY_ASYNC_STORAGE_KEY);
    const remaining = await AsyncStorage.getItem(LEGACY_ASYNC_STORAGE_KEY);
    if (remaining !== null) {
      throw new Error('Legacy auth session remains after removal.');
    }
    emitAuthTelemetry('auth.legacy_storage_cleanup.succeeded');
  } catch (error) {
    emitAuthTelemetry('auth.legacy_storage_cleanup.failed');
    throw new AuthError(
      'Không thể xóa token khỏi legacy AsyncStorage.',
      'legacy_auth_storage_cleanup_failed',
      { cause: error },
    );
  }
}

async function reconcile(session: SupabaseSession): Promise<AuthSession> {
  const generation = runtimeGeneration;
  return coordinator.reconcile(session.access_token, async () => {
    const accountIdResult = AccountIdSchema.safeParse(session.user.id);
    if (!accountIdResult.success) {
      throw new AuthError(
        'Authentication subject không đúng AccountId contract.',
        'session_subject_invalid',
        { cause: accountIdResult.error },
      );
    }
    const accountId = accountIdResult.data;
    const { data, error } = await supabaseAuthClient.rpc(
      'bootstrap_authenticated_player_v1',
      { idempotency_key: `bootstrap.identity.${accountId}` },
    );
    if (error) {
      emitAuthTelemetry('identity.bootstrap.failed', {
        code: error.code ?? 'unknown',
      });
      throw new AuthError(
        error.message || 'Không thể khôi phục player identity.',
        error.code ?? 'player_bootstrap_failed',
        { cause: error },
      );
    }

    const context = parseAuthoritativePlayerContext(data, accountId);
    if (generation !== runtimeGeneration) {
      throw new AuthError(
        'Session đã thay đổi trong lúc khôi phục identity.',
        'session_superseded',
      );
    }
    emitAuthTelemetry('identity.bootstrap.succeeded', {
      lifecycleState: context.lifecycle?.state ?? 'missing',
    });
    return toAuthoritativeAuthSession(session, context);
  });
}

export async function signInWithOAuthProvider(
  provider: OAuthProvider,
): Promise<AuthSession> {
  await initialize();
  if (oauthRequest !== null) {
    throw new AuthError(
      'Một phiên đăng nhập khác đang được xử lý.',
      'oauth_request_in_progress',
    );
  }

  const request = performOAuthSignIn(provider);
  oauthRequest = request;
  try {
    return await request;
  } finally {
    if (oauthRequest === request) oauthRequest = null;
  }
}

async function performOAuthSignIn(
  provider: OAuthProvider,
): Promise<AuthSession> {
  const expectedRedirect = redirectUri();
  try {
    const { data, error } = await supabaseAuthClient.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: expectedRedirect,
        scopes:
          provider === 'google'
            ? 'openid email profile'
            : 'email public_profile',
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      emitAuthTelemetry('auth.pkce.failed', {
        code: error.code ?? 'unknown',
      });
      throw new AuthError(
        error.message || 'Không thể khởi tạo đăng nhập.',
        error.code ?? 'oauth_authorization_failed',
        { cause: error },
      );
    }
    if (!data.url) {
      throw new AuthError(
        'Nhà cung cấp đăng nhập không trả authorization URL.',
        'oauth_missing_authorization_url',
      );
    }

    const browserResult = await WebBrowser.openAuthSessionAsync(
      data.url,
      expectedRedirect,
    );
    if (browserResult.type !== 'success') {
      emitAuthTelemetry('auth.pkce.cancelled', { result: browserResult.type });
      throw new AuthError(
        browserResult.type === 'cancel'
          ? 'Bạn đã hủy đăng nhập.'
          : 'Phiên đăng nhập đã đóng trước khi hoàn tất.',
        `oauth_${browserResult.type}`,
      );
    }

    let code: string;
    try {
      code = validateOAuthCallback(browserResult.url, expectedRedirect);
    } catch (error) {
      emitAuthTelemetry('auth.callback.rejected', { code: errorCode(error) });
      throw error;
    }

    const exchange = await supabaseAuthClient.auth.exchangeCodeForSession(code);
    if (exchange.error || !exchange.data.session) {
      emitAuthTelemetry('auth.pkce.failed', {
        code: exchange.error?.code ?? 'oauth_session_missing',
      });
      throw new AuthError(
        exchange.error?.message || 'Authorization code không tạo được session.',
        exchange.error?.code ?? 'oauth_code_exchange_failed',
        { cause: exchange.error },
      );
    }

    const session = await reconcile(exchange.data.session);
    emitAuthTelemetry('auth.pkce.succeeded');
    return session;
  } catch (error) {
    await clearPendingPkceVerifier().catch(() => undefined);
    throw error;
  }
}

export async function restoreAuthSession(): Promise<AuthSession | null> {
  await initialize();
  return coordinator.getCurrent();
}

export async function synchronizeAuthSession(): Promise<AuthSession | null> {
  await initialize();
  const { data, error } = await supabaseAuthClient.auth.getSession();
  if (error) {
    throw new AuthError(
      error.message || 'Không thể đồng bộ phiên đăng nhập.',
      error.code ?? 'session_sync_failed',
      { cause: error },
    );
  }
  if (!data.session) {
    coordinator.clear();
    return null;
  }
  return reconcile(data.session);
}

export async function refreshAuthSession(): Promise<AuthSession | null> {
  await initialize();
  if (refreshRequest !== null) return refreshRequest;

  const request = performRefresh();
  refreshRequest = request;
  try {
    return await request;
  } finally {
    if (refreshRequest === request) refreshRequest = null;
  }
}

async function performRefresh(): Promise<AuthSession | null> {
  const { data, error } = await supabaseAuthClient.auth.refreshSession();
  if (error || !data.session) {
    emitAuthTelemetry('auth.refresh.failed', {
      code: error?.code ?? 'session_missing',
    });
    if (!error || !isRetryableAuthFailure(error)) await clearLocalSession();
    if (error && isRetryableAuthFailure(error)) {
      throw new AuthError(error.message, error.code ?? 'refresh_retryable', {
        cause: error,
      });
    }
    return null;
  }

  const session = await reconcile(data.session);
  emitAuthTelemetry('auth.refresh.succeeded');
  return session;
}

export async function getValidAccessToken(
  minimumValiditySeconds: number,
): Promise<string | null> {
  await initialize();
  const current = coordinator.getCurrent();
  if (!current) return null;
  if (
    current.expiresAt - Math.floor(Date.now() / 1000) >
    minimumValiditySeconds
  ) {
    return current.accessToken;
  }
  return (await refreshAuthSession())?.accessToken ?? null;
}

export async function signOutSession(): Promise<void> {
  await initialize();
  runtimeGeneration += 1;
  coordinator.clear();
  const { error } = await supabaseAuthClient.auth.signOut({ scope: 'local' });
  try {
    await clearSupabaseAuthStorage();
  } catch (cleanupError) {
    throw new AuthError(
      'Không thể xóa hoàn toàn phiên đăng nhập khỏi SecureStore.',
      'secure_auth_storage_cleanup_failed',
      { cause: cleanupError },
    );
  }
  emitAuthTelemetry('auth.signed_out');
  if (error) {
    throw new AuthError(error.message, error.code ?? 'sign_out_failed', {
      cause: error,
    });
  }
}

export function subscribeAuthSession(
  listener: (session: AuthSession | null) => void,
): () => void {
  return coordinator.subscribe(listener);
}

export function subscribeAccessToken(
  listener: (accessToken: string | null) => void,
): () => void {
  return coordinator.subscribe((session) =>
    listener(session?.accessToken ?? null),
  );
}

async function clearLocalSession(): Promise<void> {
  runtimeGeneration += 1;
  coordinator.clear();
  await supabaseAuthClient.auth
    .signOut({ scope: 'local' })
    .catch(() => undefined);
  await clearSupabaseAuthStorage();
}

function isRetryableAuthFailure(error: { status?: number }): boolean {
  return (
    error.status === undefined ||
    error.status === 0 ||
    error.status === 429 ||
    error.status >= 500
  );
}

function isTerminalSessionError(error: unknown): boolean {
  return (
    error instanceof AuthError &&
    [
      'authoritative_context_invalid',
      'principal_account_mismatch',
      'principal_lifecycle_mismatch',
      'session_principal_mismatch',
      'session_expired',
      'session_payload_invalid',
      'session_principal_expiry_mismatch',
      'session_subject_invalid',
    ].includes(error.code)
  );
}

function errorCode(error: unknown): string {
  return error instanceof AuthError ? error.code : 'unknown';
}
