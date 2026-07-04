import { env } from '@/shared/config/env';
import type { AuthSession } from '@/shared/auth/auth-service';

export class SupabaseRestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'SupabaseRestError';
  }
}

type RestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  prefer?: string;
  session: AuthSession;
};

export async function supabaseRest<T>(path: string, options: RestOptions) {
  const response = await fetch(restUrl(path), {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${options.session.accessToken}`,
      ...(options.body === undefined ? null : { 'content-type': 'application/json' }),
      ...(options.prefer ? { prefer: options.prefer } : null),
      ...options.headers,
    },
    method: options.method ?? 'GET',
  });

  if (!response.ok) {
    throw await toRestError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function restUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return new URL(`/rest/v1/${normalizedPath}`, env.EXPO_PUBLIC_SUPABASE_URL).toString();
}

async function toRestError(response: Response) {
  const fallback = `Supabase request failed with status ${response.status}`;

  try {
    const body = (await response.json()) as {
      code?: string;
      details?: string;
      hint?: string;
      message?: string;
    };

    return new SupabaseRestError(body.message ?? fallback, response.status, body.code);
  } catch {
    return new SupabaseRestError(fallback, response.status);
  }
}
