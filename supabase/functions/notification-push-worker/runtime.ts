import { createNotificationPushWorkerHandler } from './handler.ts';

type DenoRuntime = Readonly<{
  env: Readonly<{ get(name: string): string | undefined }>;
}>;

export function createNotificationPushWorkerRuntimeHandler() {
  const deno = (globalThis as typeof globalThis & { Deno: DenoRuntime }).Deno;

  return createNotificationPushWorkerHandler({
    env: {
      EXPO_ACCESS_TOKEN: deno.env.get('EXPO_ACCESS_TOKEN') ?? undefined,
      PUSH_WORKER_SECRET: deno.env.get('PUSH_WORKER_SECRET') ?? '',
      SUPABASE_SERVICE_ROLE_KEY:
        deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      SUPABASE_URL: deno.env.get('SUPABASE_URL') ?? '',
    },
    fetch,
  });
}
