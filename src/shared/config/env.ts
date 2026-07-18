import Constants from 'expo-constants';
import { z } from 'zod';

import {
  backendProjects,
  publicBackendTargets,
  projectNameForRuntimeTarget,
} from './backend-projects';

const projectRefSchema = z.string().regex(/^[a-z0-9]{20}$/);

const publicEnvSchema = z
  .object({
    EXPO_PUBLIC_APPLICATION_RUNTIME_MODE: z.enum(['simulation', 'api']),
    EXPO_PUBLIC_BACKEND_TARGET: z.enum(publicBackendTargets),
    EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: z.string().trim().min(1),
    EXPO_PUBLIC_API_URL: z
      .string()
      .url('EXPO_PUBLIC_API_URL must be a valid URL.'),
    EXPO_PUBLIC_SUPABASE_URL: z
      .string()
      .url('EXPO_PUBLIC_SUPABASE_URL must be a valid URL.'),
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
      .string()
      .min(1, 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required.'),
    EXPO_PUBLIC_MEDIA_BASE_URL: z
      .string()
      .url('EXPO_PUBLIC_MEDIA_BASE_URL must be a valid URL.'),
  })
  .superRefine((value, context) => {
    const supabaseUrl = new URL(value.EXPO_PUBLIC_SUPABASE_URL);
    const localSupabase = ['127.0.0.1', 'localhost'].includes(
      supabaseUrl.hostname,
    );
    const observedProjectRef = resolveSupabaseProjectRef(
      value.EXPO_PUBLIC_SUPABASE_URL,
    );

    if (
      value.EXPO_PUBLIC_APPLICATION_RUNTIME_MODE === 'simulation' &&
      !localSupabase
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'simulation mode cannot use a remote Supabase project. Set EXPO_PUBLIC_APPLICATION_RUNTIME_MODE=api or use local Supabase.',
        path: ['EXPO_PUBLIC_APPLICATION_RUNTIME_MODE'],
      });
    }

    if (
      value.EXPO_PUBLIC_APPLICATION_RUNTIME_MODE === 'api' &&
      value.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY === 'development-placeholder'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'api mode requires a real Supabase publishable key.',
        path: ['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
      });
    }

    if (value.EXPO_PUBLIC_BACKEND_TARGET === 'local-simulation') {
      if (
        value.EXPO_PUBLIC_APPLICATION_RUNTIME_MODE !== 'simulation' ||
        !localSupabase ||
        value.EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF !== 'local'
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'local-simulation requires simulation mode, a local Supabase URL, and expected project ref "local".',
          path: ['EXPO_PUBLIC_BACKEND_TARGET'],
        });
      }
      return;
    }

    if (value.EXPO_PUBLIC_APPLICATION_RUNTIME_MODE !== 'api' || localSupabase) {
      context.addIssue({
        code: 'custom',
        message: `${value.EXPO_PUBLIC_BACKEND_TARGET} requires API mode and a remote Supabase URL.`,
        path: ['EXPO_PUBLIC_BACKEND_TARGET'],
      });
      return;
    }

    if (value.EXPO_PUBLIC_BACKEND_TARGET === 'staging-runtime') {
      const stagingRef = backendProjects.stagingRuntime.projectRef;
      if (
        value.EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF !== stagingRef ||
        observedProjectRef !== stagingRef
      ) {
        context.addIssue({
          code: 'custom',
          message: `staging-runtime must use ${backendProjects.stagingRuntime.projectName} (${stagingRef}); the disposable E2E project is forbidden as a mobile runtime.`,
          path: ['EXPO_PUBLIC_SUPABASE_URL'],
        });
      }
      return;
    }

    const expectedResult = projectRefSchema.safeParse(
      value.EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF,
    );
    if (!expectedResult.success) {
      context.addIssue({
        code: 'custom',
        message:
          'production-runtime requires an explicitly approved 20-character project ref.',
        path: ['EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF'],
      });
      return;
    }
    if (
      expectedResult.data === backendProjects.stagingRuntime.projectRef ||
      expectedResult.data === backendProjects.e2eDisposable.projectRef
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'production-runtime cannot reuse the staging or disposable E2E project.',
        path: ['EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF'],
      });
    }
    if (observedProjectRef !== expectedResult.data) {
      context.addIssue({
        code: 'custom',
        message:
          'production Supabase URL does not match the explicitly approved project ref.',
        path: ['EXPO_PUBLIC_SUPABASE_URL'],
      });
    }
  });

export type PublicEnv = Readonly<z.infer<typeof publicEnvSchema>>;

export function parsePublicEnv(
  input: Record<string, string | undefined>,
): PublicEnv {
  const result = publicEnvSchema.safeParse(input);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid public environment configuration: ${issues}`);
  }

  return Object.freeze(result.data);
}

type ExpoExtra = {
  publicEnv?: {
    apiUrl?: string;
    applicationRuntimeMode?: 'simulation' | 'api';
    backendTarget?: PublicEnv['EXPO_PUBLIC_BACKEND_TARGET'];
    expectedSupabaseProjectRef?: string;
    mediaBaseUrl?: string;
    supabasePublishableKey?: string;
    supabaseUrl?: string;
  };
};

const extra = Constants.expoConfig?.extra as ExpoExtra | undefined;
const publicEnv = extra?.publicEnv;
const devPublicEnv = __DEV__
  ? {
      apiUrl: 'http://127.0.0.1:3000',
      applicationRuntimeMode: 'simulation' as const,
      backendTarget: 'local-simulation' as const,
      expectedSupabaseProjectRef: 'local',
      mediaBaseUrl: 'http://127.0.0.1:3000',
      supabasePublishableKey: 'development-placeholder',
      supabaseUrl: 'http://127.0.0.1:54321',
    }
  : undefined;

// Every EXPO_PUBLIC_* variable is embedded in the client bundle. Never put secrets here.
// Native dev clients can expose an empty process.env, so use app config extra as a fallback.
export const env = parsePublicEnv({
  EXPO_PUBLIC_APPLICATION_RUNTIME_MODE:
    process.env.EXPO_PUBLIC_APPLICATION_RUNTIME_MODE ??
    publicEnv?.applicationRuntimeMode ??
    devPublicEnv?.applicationRuntimeMode,
  EXPO_PUBLIC_BACKEND_TARGET:
    process.env.EXPO_PUBLIC_BACKEND_TARGET ??
    publicEnv?.backendTarget ??
    devPublicEnv?.backendTarget,
  EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF:
    process.env.EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF ??
    publicEnv?.expectedSupabaseProjectRef ??
    devPublicEnv?.expectedSupabaseProjectRef,
  EXPO_PUBLIC_API_URL:
    process.env.EXPO_PUBLIC_API_URL ??
    publicEnv?.apiUrl ??
    devPublicEnv?.apiUrl,
  EXPO_PUBLIC_SUPABASE_URL:
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    publicEnv?.supabaseUrl ??
    devPublicEnv?.supabaseUrl,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    publicEnv?.supabasePublishableKey ??
    devPublicEnv?.supabasePublishableKey,
  EXPO_PUBLIC_MEDIA_BASE_URL:
    process.env.EXPO_PUBLIC_MEDIA_BASE_URL ??
    publicEnv?.mediaBaseUrl ??
    devPublicEnv?.mediaBaseUrl,
});

export function resolveSupabaseProjectRef(supabaseUrl: string): string {
  const hostname = new URL(supabaseUrl).hostname;
  const suffix = '.supabase.co';
  return hostname.endsWith(suffix)
    ? hostname.slice(0, -suffix.length)
    : hostname;
}

export const runtimeEnvironment = Object.freeze({
  backendTarget: env.EXPO_PUBLIC_BACKEND_TARGET,
  mode: env.EXPO_PUBLIC_APPLICATION_RUNTIME_MODE,
  projectName: projectNameForRuntimeTarget(env.EXPO_PUBLIC_BACKEND_TARGET),
  supabaseProjectRef: resolveSupabaseProjectRef(env.EXPO_PUBLIC_SUPABASE_URL),
});
