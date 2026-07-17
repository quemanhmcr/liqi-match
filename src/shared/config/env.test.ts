import { describe, expect, it } from '@jest/globals';

import { parsePublicEnv, resolveSupabaseProjectRef } from '@/shared/config/env';

describe('parsePublicEnv', () => {
  it('returns an immutable config when public env values are valid', () => {
    const parsed = parsePublicEnv({
      EXPO_PUBLIC_APPLICATION_RUNTIME_MODE: 'simulation',
      EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3000',
      EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'development-placeholder',
      EXPO_PUBLIC_MEDIA_BASE_URL: 'http://127.0.0.1:3000',
    });

    expect(parsed).toEqual({
      EXPO_PUBLIC_APPLICATION_RUNTIME_MODE: 'simulation',
      EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3000',
      EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'development-placeholder',
      EXPO_PUBLIC_MEDIA_BASE_URL: 'http://127.0.0.1:3000',
    });
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('reports the invalid variable name', () => {
    expect(() =>
      parsePublicEnv({
        EXPO_PUBLIC_APPLICATION_RUNTIME_MODE: 'api',
        EXPO_PUBLIC_API_URL: 'not-a-url',
        EXPO_PUBLIC_SUPABASE_URL: 'https://supabase.example.com',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
        EXPO_PUBLIC_MEDIA_BASE_URL: 'https://media.example.com',
      }),
    ).toThrow('EXPO_PUBLIC_API_URL');
  });

  it('rejects a remote Supabase project in simulation mode', () => {
    expect(() =>
      parsePublicEnv({
        EXPO_PUBLIC_APPLICATION_RUNTIME_MODE: 'simulation',
        EXPO_PUBLIC_API_URL: 'https://api.example.com',
        EXPO_PUBLIC_SUPABASE_URL: 'https://project-ref.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
        EXPO_PUBLIC_MEDIA_BASE_URL: 'https://media.example.com',
      }),
    ).toThrow('simulation mode cannot use a remote Supabase project');
  });

  it('rejects the development placeholder in api mode', () => {
    expect(() =>
      parsePublicEnv({
        EXPO_PUBLIC_APPLICATION_RUNTIME_MODE: 'api',
        EXPO_PUBLIC_API_URL: 'https://api.example.com',
        EXPO_PUBLIC_SUPABASE_URL: 'https://project-ref.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'development-placeholder',
        EXPO_PUBLIC_MEDIA_BASE_URL: 'https://media.example.com',
      }),
    ).toThrow('api mode requires a real Supabase publishable key');
  });

  it('derives a safe project ref without exposing credentials', () => {
    expect(
      resolveSupabaseProjectRef('https://wngumhizuxtlhavbpxzy.supabase.co'),
    ).toBe('wngumhizuxtlhavbpxzy');
    expect(resolveSupabaseProjectRef('http://127.0.0.1:54321')).toBe(
      '127.0.0.1',
    );
  });

  it('rejects an unknown application runtime mode', () => {
    expect(() =>
      parsePublicEnv({
        EXPO_PUBLIC_APPLICATION_RUNTIME_MODE: 'preview',
        EXPO_PUBLIC_API_URL: 'https://api.example.com',
        EXPO_PUBLIC_SUPABASE_URL: 'https://supabase.example.com',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
        EXPO_PUBLIC_MEDIA_BASE_URL: 'https://media.example.com',
      }),
    ).toThrow('EXPO_PUBLIC_APPLICATION_RUNTIME_MODE');
  });
});
