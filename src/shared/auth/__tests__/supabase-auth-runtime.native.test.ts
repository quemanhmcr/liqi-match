import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  AppState,
  type AppStateEvent,
  type AppStateStatus,
} from 'react-native';

type SupabaseSessionFixture = {
  access_token: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  token_type: 'bearer';
  user: {
    app_metadata: { provider: string };
    aud: string;
    created_at: string;
    email: string;
    id: string;
    user_metadata: { full_name: string };
  };
};

type MockAuthError = {
  code: string;
  message: string;
  status: number;
};

type SessionResult = {
  data: { session: SupabaseSessionFixture | null };
  error: MockAuthError | null;
};

type OAuthStartResult = {
  data: { provider: string; url: string | null };
  error: MockAuthError | null;
};

type OAuthExchangeResult = {
  data: { session: SupabaseSessionFixture | null; user: null };
  error: MockAuthError | null;
};

type RpcResult = {
  data?: unknown;
  error: MockAuthError | null;
};

type AuthStateListener = (
  event: string,
  session: SupabaseSessionFixture | null,
) => void;
type AppStateListener = (state: AppStateStatus) => void;

const mockAsyncStorage = {
  getItem: jest.fn<() => Promise<string | null>>(),
  removeItem: jest.fn<() => Promise<void>>(),
};
const mockMakeRedirectUri = jest.fn(() => 'liqimatch://auth/callback');
const mockMaybeCompleteAuthSession = jest.fn();
const mockOpenAuthSessionAsync =
  jest.fn<
    (
      url: string,
      redirectUrl: string,
    ) => Promise<
      | { type: 'success'; url: string }
      | { type: 'cancel' | 'dismiss' | 'locked' }
    >
  >();
const mockStartAutoRefresh = jest.fn();
const mockStopAutoRefresh = jest.fn();
const mockGetSession = jest.fn<() => Promise<SessionResult>>();
const mockRefreshSession = jest.fn<() => Promise<SessionResult>>();
const mockSignInWithOAuth =
  jest.fn<(input: unknown) => Promise<OAuthStartResult>>();
const mockExchangeCodeForSession =
  jest.fn<(code: string) => Promise<OAuthExchangeResult>>();
const mockSignOut =
  jest.fn<(input?: unknown) => Promise<{ error: MockAuthError | null }>>();
const mockRpc =
  jest.fn<
    (name: string, args: Record<string, unknown>) => Promise<RpcResult>
  >();
const mockClearPendingPkceVerifier = jest.fn<() => Promise<void>>();
const mockClearSupabaseAuthStorage = jest.fn<() => Promise<void>>();
const mockOnAuthStateChange = jest.fn<
  (listener: AuthStateListener) => {
    data: { subscription: { unsubscribe: () => void } };
  }
>();
const mockAppStateAddEventListener =
  jest.fn<
    (event: AppStateEvent, listener: AppStateListener) => { remove: () => void }
  >();

let appStateListener: AppStateListener | null = null;
let authStateListener: AuthStateListener | null = null;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: mockMakeRedirectUri,
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: mockMaybeCompleteAuthSession,
  openAuthSessionAsync: mockOpenAuthSessionAsync,
}));

jest.mock('@/shared/auth/supabase-auth-client', () => ({
  clearPendingPkceVerifier: mockClearPendingPkceVerifier,
  clearSupabaseAuthStorage: mockClearSupabaseAuthStorage,
  supabaseAuthClient: {
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      refreshSession: mockRefreshSession,
      signInWithOAuth: mockSignInWithOAuth,
      signOut: mockSignOut,
      startAutoRefresh: mockStartAutoRefresh,
      stopAutoRefresh: mockStopAutoRefresh,
    },
    rpc: mockRpc,
  },
}));

const accountId = '01000000-0000-4000-8000-000000000020';
const playerId = '20000000-0000-4000-8000-000000000020';
const profileId = '30000000-0000-4000-8000-000000000020';
const sessionId = '09000000-0000-4000-8000-000000000020';
const expiresAt = 4_102_444_800;

function supabaseSession(accessToken = 'access-token'): SupabaseSessionFixture {
  return {
    access_token: accessToken,
    expires_at: expiresAt,
    expires_in: 3_600,
    refresh_token: `refresh-${accessToken}`,
    token_type: 'bearer',
    user: {
      app_metadata: { provider: 'google' },
      aud: 'authenticated',
      created_at: '2026-07-14T08:00:00.000Z',
      email: 'player@example.test',
      id: accountId,
      user_metadata: { full_name: 'Player' },
    },
  };
}

function authority(state: 'active' | 'onboarding' | 'suspended' = 'active') {
  const active = state === 'active';
  return {
    lifecycle: {
      discoverable: active,
      messagingAllowed: active,
      playerId,
      profileId,
      state,
      updatedAt: '2026-07-14T08:05:00.000Z',
      version: state === 'suspended' ? 3 : 2,
    },
    principal: {
      accountId,
      expiresAt: '2100-01-01T00:00:00.000Z',
      issuedAt: '2099-12-31T23:00:00.000Z',
      playerId,
      sessionId,
    },
    repeated: true,
  };
}

type AuthRuntime = typeof import('@/shared/auth/supabase-auth-runtime');

function loadRuntime(): AuthRuntime {
  let runtime: AuthRuntime | undefined;
  jest.isolateModules(() => {
    runtime = jest.requireActual<AuthRuntime>(
      '@/shared/auth/supabase-auth-runtime',
    );
  });
  if (!runtime) throw new Error('Auth runtime failed to load.');
  return runtime;
}

async function flushDeferredWork() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('Supabase PKCE auth runtime', () => {
  beforeEach(() => {
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(mockAppStateAddEventListener);
    jest.restoreAllMocks();
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(mockAppStateAddEventListener as never);
    appStateListener = null;
    authStateListener = null;
    mockAsyncStorage.getItem.mockReset().mockResolvedValue(null);
    mockAsyncStorage.removeItem.mockReset().mockResolvedValue(undefined);
    mockMakeRedirectUri.mockClear();
    mockMaybeCompleteAuthSession.mockClear();
    mockOpenAuthSessionAsync.mockReset();
    mockStartAutoRefresh.mockClear();
    mockStopAutoRefresh.mockClear();
    mockGetSession.mockReset();
    mockRefreshSession.mockReset();
    mockSignInWithOAuth.mockReset();
    mockExchangeCodeForSession.mockReset();
    mockSignOut.mockReset().mockResolvedValue({ error: null });
    mockRpc.mockReset().mockResolvedValue({ data: authority(), error: null });
    mockClearPendingPkceVerifier.mockReset().mockResolvedValue(undefined);
    mockClearSupabaseAuthStorage.mockReset().mockResolvedValue(undefined);
    mockOnAuthStateChange.mockReset().mockImplementation((listener) => {
      authStateListener = listener;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
    mockAppStateAddEventListener
      .mockReset()
      .mockImplementation((_event, listener) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('restores once, verifies legacy token removal, and resolves authoritative player state', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: supabaseSession() },
      error: null,
    });
    const runtime = await loadRuntime();

    const [first, second] = await Promise.all([
      runtime.restoreAuthSession(),
      runtime.restoreAuthSession(),
    ]);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      accessToken: 'access-token',
      lifecycle: { playerId, state: 'active' },
      principal: { accountId, playerId },
    });
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(
      '@liqi-match/auth-session-v1',
    );
    expect(mockAsyncStorage.getItem).toHaveBeenCalledWith(
      '@liqi-match/auth-session-v1',
    );
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('bootstrap_authenticated_player_v1', {
      idempotency_key: `bootstrap.identity.${accountId}`,
    });
    expect(mockStartAutoRefresh).toHaveBeenCalledTimes(1);
    expect(mockAppStateAddEventListener).toHaveBeenCalledTimes(1);
  });

  it('retries initialization after a transient restore failure without duplicating listeners or clearing storage', async () => {
    mockGetSession
      .mockResolvedValueOnce({
        data: { session: null },
        error: { code: 'network_error', message: 'offline', status: 503 },
      })
      .mockResolvedValueOnce({
        data: { session: supabaseSession() },
        error: null,
      });
    const runtime = await loadRuntime();

    await expect(runtime.restoreAuthSession()).rejects.toMatchObject({
      code: 'network_error',
    });
    expect(mockClearSupabaseAuthStorage).not.toHaveBeenCalled();

    await expect(runtime.restoreAuthSession()).resolves.toMatchObject({
      accessToken: 'access-token',
    });
    expect(mockAppStateAddEventListener).toHaveBeenCalledTimes(1);
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it('performs Authorization Code + PKCE and exchanges only a validated code', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSignInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: 'https://auth.example/authorize' },
      error: null,
    });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'liqimatch://auth/callback?code=pkce-code',
    });
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: supabaseSession('signed-in-token'), user: null },
      error: null,
    });
    const runtime = await loadRuntime();

    const session = await runtime.signInWithOAuthProvider('google');

    expect(session.accessToken).toBe('signed-in-token');
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: expect.objectContaining({
        redirectTo: 'liqimatch://auth/callback',
        skipBrowserRedirect: true,
      }),
    });
    expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
      'https://auth.example/authorize',
      'liqimatch://auth/callback',
    );
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('pkce-code');
  });

  it('rejects an implicit token callback before code exchange', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSignInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: 'https://auth.example/authorize' },
      error: null,
    });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'liqimatch://auth/callback#access_token=secret',
    });
    const runtime = await loadRuntime();

    await expect(
      runtime.signInWithOAuthProvider('google'),
    ).rejects.toMatchObject({ code: 'oauth_implicit_callback_rejected' });
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockClearPendingPkceVerifier).toHaveBeenCalledTimes(1);
  });

  it('re-resolves lifecycle on foreground and publishes suspension without changing tokens', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: supabaseSession() },
      error: null,
    });
    const runtime = await loadRuntime();
    await runtime.restoreAuthSession();
    const observed: (string | null)[] = [];
    runtime.subscribeAuthSession((session) => {
      observed.push(session?.lifecycle?.state ?? null);
    });

    mockRpc.mockResolvedValueOnce({
      data: authority('suspended'),
      error: null,
    });
    appStateListener?.('active');
    await flushDeferredWork();

    expect(observed.at(-1)).toBe('suspended');
    expect(mockStartAutoRefresh).toHaveBeenCalledTimes(2);
  });

  it('clears local secure storage even when remote sign-out reports an error', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSignOut.mockResolvedValue({
      error: { code: 'network_error', message: 'offline', status: 503 },
    });
    const runtime = await loadRuntime();

    await expect(runtime.signOutSession()).rejects.toMatchObject({
      code: 'network_error',
    });
    expect(mockClearSupabaseAuthStorage).toHaveBeenCalledTimes(1);
  });

  it('fails closed when secure session cleanup cannot be verified', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockClearSupabaseAuthStorage.mockRejectedValue(
      new Error('simulated SecureStore deletion failure'),
    );
    const runtime = await loadRuntime();

    await expect(runtime.signOutSession()).rejects.toMatchObject({
      code: 'secure_auth_storage_cleanup_failed',
    });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('publishes rotated access tokens for realtime consumers', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: supabaseSession() },
      error: null,
    });
    const runtime = await loadRuntime();
    await runtime.restoreAuthSession();
    const observed: (string | null)[] = [];
    runtime.subscribeAccessToken((token) => observed.push(token));

    mockRpc.mockResolvedValueOnce({ data: authority(), error: null });
    authStateListener?.('TOKEN_REFRESHED', supabaseSession('rotated-token'));
    await flushDeferredWork();

    expect(observed).toEqual(['access-token', 'rotated-token']);
  });
});
