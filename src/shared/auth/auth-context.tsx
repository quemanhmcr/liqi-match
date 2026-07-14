import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  type AuthSession,
  type OAuthProvider,
  restoreAuthSession,
  signInWithOAuthProvider,
  signOutSession,
  subscribeAuthSession,
} from './auth-service';

type AuthContextValue = {
  error: string | null;
  loading: boolean;
  session: AuthSession | null;
  signIn: (provider: OAuthProvider) => Promise<AuthSession>;
  signOut: () => Promise<void>;
  setSession: (session: AuthSession | null) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthStateProviderProps = PropsWithChildren<{
  /** Test-only deterministic state. Omit in the app to hydrate secure storage. */
  initialSession?: AuthSession | null;
}>;

export function AuthStateProvider({
  children,
  initialSession,
}: AuthStateProviderProps) {
  const controlledForTest = initialSession !== undefined;
  const [session, setSession] = useState<AuthSession | null>(
    initialSession ?? null,
  );
  const [loading, setLoading] = useState(!controlledForTest);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (controlledForTest) return;

    let active = true;
    const unsubscribe = subscribeAuthSession((nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setError(null);
    });

    void restoreAuthSession()
      .then((restored) => {
        if (!active) return;
        setSession(restored);
        setError(null);
      })
      .catch((caught) => {
        if (!active) return;
        setSession(null);
        setError(errorMessage(caught, 'Không thể khôi phục phiên đăng nhập.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [controlledForTest]);

  const signIn = useCallback(async (provider: OAuthProvider) => {
    setLoading(true);
    setError(null);
    try {
      const nextSession = await signInWithOAuthProvider(provider);
      setSession(nextSession);
      return nextSession;
    } catch (caught) {
      setError(errorMessage(caught, 'Không thể đăng nhập.'));
      throw caught;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await signOutSession(session);
      setSession(null);
    } catch (caught) {
      setError(errorMessage(caught, 'Không thể đăng xuất.'));
      throw caught;
    } finally {
      setLoading(false);
    }
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({ error, loading, session, setSession, signIn, signOut }),
    [error, loading, session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthStateProvider.');
  return value;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
