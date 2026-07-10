import type { PropsWithChildren } from 'react';
import {
  createContext,
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
} from '@/shared/auth/auth-service';

type AuthContextValue = {
  loading: boolean;
  session: AuthSession | null;
  signIn: (provider: OAuthProvider) => Promise<AuthSession>;
  signOut: () => Promise<void>;
  setSession: (session: AuthSession | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthStateProviderProps = PropsWithChildren<{
  /** Test-only deterministic state. Omit in the app to hydrate secure storage. */
  initialSession?: AuthSession | null;
}>;

export function AuthStateProvider({
  children,
  initialSession,
}: AuthStateProviderProps) {
  const hasInitialSession = initialSession !== undefined;
  const [loading, setLoading] = useState(!hasInitialSession);
  const [session, setSession] = useState<AuthSession | null>(
    initialSession ?? null,
  );

  useEffect(() => {
    if (hasInitialSession) return;

    let active = true;

    async function hydrate() {
      const restored = await restoreAuthSession();
      if (active) {
        setSession(restored);
        setLoading(false);
      }
    }

    hydrate().catch(() => {
      if (active) {
        setSession(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [hasInitialSession]);

  const signIn = useCallback(async (provider: OAuthProvider) => {
    const nextSession = await signInWithOAuthProvider(provider);
    setSession(nextSession);
    return nextSession;
  }, []);

  const signOut = useCallback(async () => {
    const currentSession = session;
    setSession(null);
    await signOutSession(currentSession);
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({ loading, session, setSession, signIn, signOut }),
    [loading, session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthStateProvider');
  }

  return value;
}
