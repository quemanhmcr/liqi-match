import { jest } from '@jest/globals';

jest.setTimeout(5_000);

Object.defineProperty(globalThis, '__DEV__', {
  configurable: true,
  value: true,
});

process.env.EXPO_PUBLIC_BACKEND_TARGET ??= 'local-simulation';
process.env.EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF ??= 'local';
process.env.EXPO_PUBLIC_API_URL ??= 'http://localhost:3000';
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'test-publishable-key';
process.env.EXPO_PUBLIC_MEDIA_BASE_URL ??= 'http://127.0.0.1:8787';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    clear: async () => undefined,
    getItem: async () => null,
    removeItem: async () => undefined,
    setItem: async () => undefined,
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));
