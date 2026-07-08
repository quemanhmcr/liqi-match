import { jest } from '@jest/globals';
import type { ReactNode } from 'react';


jest.mock('@shopify/react-native-skia', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View: MockView } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  );
  const MockSkiaNode = ({ children }: { children?: ReactNode }) =>
    ReactActual.createElement(MockView, null, children);

  return {
    __esModule: true,
    BlurMask: MockSkiaNode,
    Canvas: MockSkiaNode,
    Path: MockSkiaNode,
  };
});

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

jest.mock('@/shared/auth/auth-context', () => ({
  AuthStateProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    loading: false,
    session: {
      accessToken: 'test-access-token',
      expiresAt: 4102444800,
      refreshToken: 'test-refresh-token',
      tokenType: 'bearer',
      user: {
        email: 'tester@example.com',
        id: '00000000-0000-0000-0000-000000000001',
        user_metadata: {
          full_name: 'Test Player',
        },
      },
    },
    setSession: async () => undefined,
    signIn: async () => ({
      accessToken: 'test-access-token',
      expiresAt: 4102444800,
      refreshToken: 'test-refresh-token',
      tokenType: 'bearer',
      user: {
        email: 'tester@example.com',
        id: '00000000-0000-0000-0000-000000000001',
        user_metadata: {
          full_name: 'Test Player',
        },
      },
    }),
    signOut: async () => undefined,
  }),
}));
