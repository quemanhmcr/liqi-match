import type { AuthSession } from '@/shared/auth/auth-service';
import {
  CoreErrorV1Schema,
  type CoreErrorCodeV1,
} from '@/shared/contracts/core-v1';
import { env, runtimeEnvironment } from '@/shared/config/env';

export class SupabaseRestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: CoreErrorCodeV1 | string,
    readonly requestId?: string,
    readonly retryable = false,
    readonly details?: Record<string, unknown>,
    readonly databaseCode?: string,
  ) {
    super(message);
    this.name = 'SupabaseRestError';
  }
}

type RestOptions = {
  body?: unknown;
  signal?: AbortSignal;
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
      ...(options.body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
      ...(options.prefer ? { prefer: options.prefer } : {}),
      ...options.headers,
    },
    method: options.method ?? 'GET',
    signal: options.signal,
  });

  if (!response.ok) {
    throw await toRestError(response, path);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function restUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return new URL(
    `/rest/v1/${normalizedPath}`,
    env.EXPO_PUBLIC_SUPABASE_URL,
  ).toString();
}

async function toRestError(response: Response, path: string) {
  const fallback = `Supabase request failed with status ${response.status}`;
  const headerRequestId =
    response.headers.get('x-request-id') ??
    response.headers.get('sb-request-id') ??
    undefined;

  try {
    const body = (await response.json()) as {
      code?: string;
      details?: unknown;
      hint?: string;
      message?: string;
    };
    const coreError = parseCoreError(body.message);
    if (coreError) {
      return new SupabaseRestError(
        coreError.message,
        response.status,
        coreError.code,
        coreError.requestId,
        coreError.retryable,
        withRuntimeContext(coreError.details, path),
        body.code,
      );
    }

    return new SupabaseRestError(
      body.message ?? fallback,
      response.status,
      body.code,
      headerRequestId,
      isRetryableStatus(response.status),
      withRuntimeContext(recordOrUndefined(body.details), path),
      body.code,
    );
  } catch {
    return new SupabaseRestError(
      fallback,
      response.status,
      undefined,
      headerRequestId,
      isRetryableStatus(response.status),
      withRuntimeContext(undefined, path),
    );
  }
}

function parseCoreError(message: string | undefined) {
  if (!message) return null;
  try {
    const parsed = CoreErrorV1Schema.safeParse(JSON.parse(message));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function withRuntimeContext(
  details: Record<string, unknown> | undefined,
  path: string,
): Record<string, unknown> {
  return {
    ...(details ?? {}),
    projectRef: runtimeEnvironment.supabaseProjectRef,
    restPath: path,
  };
}

function recordOrUndefined(value: unknown) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}
