import { describe, expect, it } from '@jest/globals';

import { backendProjects } from '@/shared/config/backend-projects';
import { parsePublicEnv, resolveSupabaseProjectRef } from '@/shared/config/env';

function localEnvironment() {
  return {
    EXPO_PUBLIC_APPLICATION_RUNTIME_MODE: 'simulation',
    EXPO_PUBLIC_BACKEND_TARGET: 'local-simulation',
    EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: 'local',
    EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3000',
    EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'development-placeholder',
    EXPO_PUBLIC_MEDIA_BASE_URL: 'http://127.0.0.1:3000',
  } as const;
}

function stagingEnvironment() {
  return {
    EXPO_PUBLIC_APPLICATION_RUNTIME_MODE: 'api',
    EXPO_PUBLIC_BACKEND_TARGET: 'staging-runtime',
    EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF:
      backendProjects.stagingRuntime.projectRef,
    EXPO_PUBLIC_API_URL: 'https://api-staging.example.com',
    EXPO_PUBLIC_SUPABASE_URL: `https://${backendProjects.stagingRuntime.projectRef}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
    EXPO_PUBLIC_MEDIA_BASE_URL: 'https://media-staging.example.com',
  } as const;
}

describe('parsePublicEnv', () => {
  it('returns an immutable local simulation config', () => {
    const input = localEnvironment();
    const parsed = parsePublicEnv(input);

    expect(parsed).toEqual(input);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('accepts only the registered staging project for staging runtime', () => {
    expect(parsePublicEnv(stagingEnvironment())).toEqual(stagingEnvironment());
  });

  it('reports the invalid variable name', () => {
    expect(() =>
      parsePublicEnv({
        ...stagingEnvironment(),
        EXPO_PUBLIC_API_URL: 'not-a-url',
      }),
    ).toThrow('EXPO_PUBLIC_API_URL');
  });

  it('rejects a remote Supabase project in simulation mode', () => {
    expect(() =>
      parsePublicEnv({
        ...localEnvironment(),
        EXPO_PUBLIC_SUPABASE_URL: `https://${backendProjects.stagingRuntime.projectRef}.supabase.co`,
      }),
    ).toThrow('simulation mode cannot use a remote Supabase project');
  });

  it('rejects the development placeholder in api mode', () => {
    expect(() =>
      parsePublicEnv({
        ...stagingEnvironment(),
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'development-placeholder',
      }),
    ).toThrow('api mode requires a real Supabase publishable key');
  });

  it('rejects the disposable E2E project as a mobile runtime', () => {
    expect(() =>
      parsePublicEnv({
        ...stagingEnvironment(),
        EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF:
          backendProjects.e2eDisposable.projectRef,
        EXPO_PUBLIC_SUPABASE_URL: `https://${backendProjects.e2eDisposable.projectRef}.supabase.co`,
      }),
    ).toThrow('disposable E2E project is forbidden as a mobile runtime');
  });

  it('requires production to use an explicit distinct project ref', () => {
    const productionRef = 'abcdefghijklmnopqrst';
    expect(
      parsePublicEnv({
        ...stagingEnvironment(),
        EXPO_PUBLIC_BACKEND_TARGET: 'production-runtime',
        EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: productionRef,
        EXPO_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co`,
      }).EXPO_PUBLIC_BACKEND_TARGET,
    ).toBe('production-runtime');

    expect(() =>
      parsePublicEnv({
        ...stagingEnvironment(),
        EXPO_PUBLIC_BACKEND_TARGET: 'production-runtime',
      }),
    ).toThrow('production-runtime cannot reuse the staging or disposable E2E');
  });

  it('derives a safe project ref without exposing credentials', () => {
    expect(
      resolveSupabaseProjectRef(
        `https://${backendProjects.stagingRuntime.projectRef}.supabase.co`,
      ),
    ).toBe(backendProjects.stagingRuntime.projectRef);
    expect(resolveSupabaseProjectRef('http://127.0.0.1:54321')).toBe(
      '127.0.0.1',
    );
  });

  it('rejects an unknown application runtime mode', () => {
    expect(() =>
      parsePublicEnv({
        ...stagingEnvironment(),
        EXPO_PUBLIC_APPLICATION_RUNTIME_MODE: 'preview',
      }),
    ).toThrow('EXPO_PUBLIC_APPLICATION_RUNTIME_MODE');
  });

  it('rejects an unknown backend target', () => {
    expect(() =>
      parsePublicEnv({
        ...stagingEnvironment(),
        EXPO_PUBLIC_BACKEND_TARGET: 'review',
      }),
    ).toThrow('EXPO_PUBLIC_BACKEND_TARGET');
  });
});
