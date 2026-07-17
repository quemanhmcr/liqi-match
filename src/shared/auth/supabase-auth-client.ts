import 'react-native-url-polyfill/auto';

import { createClient, processLock } from '@supabase/supabase-js';

import { env } from '@/shared/config/env';

import {
  createAuthStorageKey,
  LEGACY_AUTH_STORAGE_KEY,
} from './auth-storage-key';
import { createSecureAuthStorage } from './secure-auth-storage';

export const AUTH_STORAGE_KEY = createAuthStorageKey(
  env.EXPO_PUBLIC_SUPABASE_URL,
  __DEV__,
);

export const authStorage = createSecureAuthStorage();

export async function clearPendingPkceVerifier(): Promise<void> {
  await authStorage.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`);
}

/**
 * The only Supabase Auth client in the mobile runtime. Supabase owns PKCE
 * verifier persistence, refresh-token rotation, locking, and auth events.
 */
export const supabaseAuthClient = createClient(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      lock: processLock,
      persistSession: true,
      storage: authStorage,
      storageKey: AUTH_STORAGE_KEY,
    },
  },
);

export async function clearSupabaseAuthStorage(): Promise<void> {
  const keys = new Set([
    AUTH_STORAGE_KEY,
    `${AUTH_STORAGE_KEY}-code-verifier`,
    ...(AUTH_STORAGE_KEY !== LEGACY_AUTH_STORAGE_KEY
      ? [LEGACY_AUTH_STORAGE_KEY, `${LEGACY_AUTH_STORAGE_KEY}-code-verifier`]
      : []),
  ]);
  const results = await Promise.allSettled(
    [...keys].map((key) => authStorage.removeItem(key)),
  );
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      'Secure auth storage could not be fully cleared.',
    );
  }
}
