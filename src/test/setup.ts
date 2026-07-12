import { jest } from '@jest/globals';
import type { ReactNode } from 'react';

jest.mock('expo-blur', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View: MockView } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const MockBlurView = ReactActual.forwardRef(
    ({ children, ...props }: { children?: ReactNode }, _ref) =>
      ReactActual.createElement(MockView, props, children),
  );

  return {
    __esModule: true,
    BlurTargetView: MockBlurView,
    BlurView: MockBlurView,
  };
});

jest.mock('react-native-reanimated', () =>
  jest.requireActual('react-native-reanimated/mock'),
);

jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);

jest.mock('@shopify/react-native-skia', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View: MockView } =
    jest.requireActual<typeof import('react-native')>('react-native');
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
