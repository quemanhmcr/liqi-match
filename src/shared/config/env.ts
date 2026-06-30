import { z } from 'zod';

const publicEnvSchema = z.object({
  EXPO_PUBLIC_API_URL: z
    .string()
    .url('EXPO_PUBLIC_API_URL must be a valid URL.'),
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

// Every EXPO_PUBLIC_* variable is embedded in the client bundle. Never put secrets here.
export const env = parsePublicEnv(process.env);
