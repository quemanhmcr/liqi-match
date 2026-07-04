import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

import { env } from '@/shared/config/env';

export type OAuthProvider = 'google' | 'facebook';

export type SupabaseUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

export type AuthSession = {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
  tokenType: string;
  user: SupabaseUser;
};

const AUTH_STORAGE_KEY = '@liqi-match/auth-session-v1';
const CALLBACK_TIMEOUT_MS = 120_000;
const REFRESH_SKEW_SECONDS = 60;

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function signInWithOAuthProvider(
  provider: OAuthProvider,
): Promise<AuthSession> {
  const redirectTo = Linking.createURL('auth/callback');
  const authorizeUrl = new URL('/auth/v1/authorize', env.EXPO_PUBLIC_SUPABASE_URL);

  authorizeUrl.searchParams.set('provider', provider);
  authorizeUrl.searchParams.set('redirect_to', redirectTo);
  authorizeUrl.searchParams.set('flow_type', 'implicit');
  authorizeUrl.searchParams.set('scopes', 'email profile');

  const callbackUrl = await waitForOAuthCallback(authorizeUrl.toString());
  const params = parseAuthCallbackParams(callbackUrl);
  const error = params.get('error') ?? params.get('error_code');

  if (error) {
    const description =
      params.get('error_description') ?? 'Đăng nhập đã bị hủy hoặc không thành công.';
    throw new AuthError(description, error);
  }

  if (params.get('code')) {
    throw new AuthError(
      'Supabase OAuth đang trả authorization code. Hãy bật implicit flow hoặc cấu hình PKCE ở task sau.',
      'oauth_code_flow_not_supported',
    );
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || !refreshToken) {
    throw new AuthError('OAuth callback thiếu access token.', 'oauth_missing_token');
  }

  const tokenType = params.get('token_type') ?? 'bearer';
  const expiresIn = Number(params.get('expires_in') ?? 3600);
  const user = await fetchCurrentUser(accessToken);
  const session: AuthSession = {
    accessToken,
    expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    refreshToken,
    tokenType,
    user,
  };

  await persistSession(session);
  return session;
}

export async function restoreAuthSession(): Promise<AuthSession | null> {
  const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as AuthSession;
    if (!session.accessToken || !session.refreshToken || !session.user?.id) {
      await clearAuthSession();
      return null;
    }

    if (shouldRefresh(session)) {
      return await refreshAuthSession(session.refreshToken);
    }

    return session;
  } catch {
    await clearAuthSession();
    return null;
  }
}

export async function refreshAuthSession(
  refreshToken: string,
): Promise<AuthSession | null> {
  const response = await fetch(
    new URL('/auth/v1/token?grant_type=refresh_token', env.EXPO_PUBLIC_SUPABASE_URL),
    {
      body: JSON.stringify({ refresh_token: refreshToken }),
      headers: authHeaders({ includeJson: true }),
      method: 'POST',
    },
  );

  if (!response.ok) {
    await clearAuthSession();
    return null;
  }

  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    token_type?: string;
    user?: SupabaseUser;
  };

  if (!body.access_token || !body.refresh_token || !body.user?.id) {
    await clearAuthSession();
    return null;
  }

  const session: AuthSession = {
    accessToken: body.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + Number(body.expires_in ?? 3600),
    refreshToken: body.refresh_token,
    tokenType: body.token_type ?? 'bearer',
    user: body.user,
  };

  await persistSession(session);
  return session;
}

export async function signOutSession(session: AuthSession | null) {
  if (session) {
    await fetch(new URL('/auth/v1/logout', env.EXPO_PUBLIC_SUPABASE_URL), {
      headers: {
        ...authHeaders({ includeJson: false }),
        authorization: `Bearer ${session.accessToken}`,
      },
      method: 'POST',
    }).catch(() => undefined);
  }

  await clearAuthSession();
}

export function shouldRefresh(session: AuthSession) {
  return session.expiresAt - Math.floor(Date.now() / 1000) <= REFRESH_SKEW_SECONDS;
}

async function fetchCurrentUser(accessToken: string): Promise<SupabaseUser> {
  const response = await fetch(new URL('/auth/v1/user', env.EXPO_PUBLIC_SUPABASE_URL), {
    headers: {
      ...authHeaders({ includeJson: false }),
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new AuthError('Không thể đọc thông tin người dùng sau đăng nhập.', 'user_lookup_failed');
  }

  const user = (await response.json()) as SupabaseUser;
  if (!user.id) {
    throw new AuthError('Supabase Auth không trả user id.', 'user_missing_id');
  }

  return user;
}

async function waitForOAuthCallback(authorizeUrl: string) {
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    let subscription: ReturnType<typeof Linking.addEventListener> | undefined;

    const cleanup = () => {
      subscription?.remove();
      clearTimeout(timeout);
    };

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const timeout = setTimeout(() => {
      settle(() =>
        reject(
          new AuthError(
            'Quá thời gian chờ đăng nhập. Vui lòng thử lại.',
            'oauth_timeout',
          ),
        ),
      );
    }, CALLBACK_TIMEOUT_MS);

    subscription = Linking.addEventListener('url', ({ url }) => {
      if (!isOAuthCallbackUrl(url)) return;
      settle(() => resolve(url));
    });

    Linking.openURL(authorizeUrl).catch((error: unknown) => {
      settle(() =>
        reject(
          error instanceof Error
            ? error
            : new AuthError('Không thể mở trình đăng nhập.', 'oauth_open_failed'),
        ),
      );
    });
  });
}

function isOAuthCallbackUrl(url: string) {
  const params = parseAuthCallbackParams(url);
  return Boolean(
    params.get('access_token') ||
      params.get('refresh_token') ||
      params.get('error') ||
      params.get('error_code') ||
      params.get('code'),
  );
}

function parseAuthCallbackParams(url: string) {
  const params = new URLSearchParams();
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const fragments = [
    queryIndex >= 0
      ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined)
      : '',
    hashIndex >= 0 ? url.slice(hashIndex + 1) : '',
  ];

  for (const fragment of fragments) {
    const fragmentParams = new URLSearchParams(fragment);
    fragmentParams.forEach((value, key) => params.set(key, value));
  }

  return params;
}

function authHeaders({ includeJson }: { includeJson: boolean }) {
  return {
    apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ...(includeJson ? { 'content-type': 'application/json' } : null),
  };
}

async function persistSession(session: AuthSession) {
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

async function clearAuthSession() {
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
}
