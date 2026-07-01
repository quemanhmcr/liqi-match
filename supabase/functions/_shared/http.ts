export const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
};

export const corsHeaders = {
  'access-control-allow-origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'access-control-allow-headers':
    'authorization, x-client-info, apikey, content-type, idempotency-key',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      ...jsonHeaders,
      ...(init.headers ?? {}),
    },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return jsonResponse({ error: { code, message, details } }, { status });
}

export function requireBearerToken(request: Request): string {
  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    throw new Error('Missing bearer token');
  }

  return authorization.slice('Bearer '.length);
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error('Invalid JSON request body');
  }
}
