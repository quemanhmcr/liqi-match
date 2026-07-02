import Constants from 'expo-constants';
import { z } from 'zod';

const publicEnvSchema = z.object({
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
      mediaBaseUrl: 'http://127.0.0.1:3000',
      supabasePublishableKey: 'development-placeholder',
      supabaseUrl: 'http://127.0.0.1:54321',
    }
  : undefined;

// Every EXPO_PUBLIC_* variable is embedded in the client bundle. Never put secrets here.
// Native dev clients can expose an empty process.env, so use app config extra as a fallback.
export const env = parsePublicEnv({
  EXPO_PUBLIC_API_URL:
    process.env.EXPO_PUBLIC_API_URL ?? publicEnv?.apiUrl ?? devPublicEnv?.apiUrl,
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
