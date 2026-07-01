import { BasicImageMediaProcessor } from './media-processor';

type Env = {
  R2_BUCKET: R2Bucket;
  MEDIA_QUEUE?: Queue;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_JWKS_URL: string;
  INTERNAL_WORKER_TOKEN?: string;
  MEDIA_ENV: string;
};

type JwtPayload = {
  sub: string;
  exp: number;
  aud?: string | string[];
};

type Jwks = {
  keys: Array<JsonWebKey & { kid?: string }>;
};

type MediaAsset = {
  id: string;
  owner_id: string;
  object_key: string;
  mime_type: string;
  byte_size: number;
  visibility:
    'public' | 'matched_users' | 'conversation_members' | 'moderators_only';
  status: string;
  moderation_status: string;
  deleted_at: string | null;
};

type AuthorizationResult = {
  authenticated: boolean;
  allowed: boolean;
  userId?: string;
};

type MediaQueueMessage =
  | {
      type: 'media_delete_requested';
      assetId: string;
      objectKey: string;
      requestId?: string;
    }
  | {
      type: 'media_object_missing' | 'media_validation_failed';
      assetId: string;
      objectKey: string;
      error?: string;
      requestId?: string;
    };

const processor = new BasicImageMediaProcessor();

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    if (
      request.method === 'POST' &&
      url.pathname === '/internal/media/delete'
    ) {
      return handleInternalDelete(request, env, requestId);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return jsonError(405, 'method_not_allowed', requestId);
    }

    if (url.pathname === '/health') {
      return Response.json({ ok: true, env: env.MEDIA_ENV, requestId });
    }

    const match = url.pathname.match(/^\/media\/([0-9a-fA-F-]{36})$/);

    if (!match?.[1]) {
      return jsonError(404, 'not_found', requestId);
    }

    try {
      const asset = await fetchAsset(env, match[1]);

      if (!asset || asset.deleted_at !== null || asset.status !== 'ready') {
        return jsonError(404, 'media_not_found', requestId);
      }

      if (asset.moderation_status !== 'approved') {
        return jsonError(404, 'media_not_found', requestId);
      }

      const authorization = await authorizeRequest(request, env, asset);

      if (asset.visibility !== 'public' && !authorization.authenticated) {
        return jsonError(401, 'authentication_required', requestId);
      }

      if (asset.visibility !== 'public' && !authorization.allowed) {
        return jsonError(404, 'media_not_found', requestId);
      }

      const object = await env.R2_BUCKET.get(asset.object_key, {
        range: request.headers,
      });

      if (!object) {
        if (env.MEDIA_QUEUE) {
          ctx.waitUntil(
            env.MEDIA_QUEUE.send({
              type: 'media_object_missing',
              assetId: asset.id,
              objectKey: asset.object_key,
              requestId,
            }),
          );
        }
        return jsonError(404, 'object_not_found', requestId);
      }

      const headers = mediaHeaders(asset, object, requestId);

      if (request.method === 'HEAD') {
        return new Response(null, { headers });
      }

      const sample = await env.R2_BUCKET.get(asset.object_key, {
        range: { offset: 0, length: 32 },
      });
      const sampleBytes = sample
        ? new Uint8Array(await sample.arrayBuffer())
        : new Uint8Array();
      const validation = processor.validateMagicBytes(
        sampleBytes,
        asset.mime_type,
      );

      if (!validation.ok) {
        if (env.MEDIA_QUEUE) {
          ctx.waitUntil(
            env.MEDIA_QUEUE.send({
              type: 'media_validation_failed',
              assetId: asset.id,
              objectKey: asset.object_key,
              error: validation.error,
              requestId,
            }),
          );
        }

        return jsonError(415, 'invalid_media_bytes', requestId);
      }

      return new Response(object.body, { headers });
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          requestId,
          message: error instanceof Error ? error.message : 'unknown_error',
        }),
      );

      return jsonError(500, 'internal_error', requestId);
    }
  },

  async queue(batch: MessageBatch<MediaQueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        if (message.body.type === 'media_delete_requested') {
          await processMediaDelete(env, message.body);
        }

        message.ack();
      } catch (error) {
        console.error(
          JSON.stringify({
            level: 'error',
            messageId: message.id,
            body: message.body,
            message: error instanceof Error ? error.message : 'unknown_error',
          }),
        );
        message.retry();
      }
    }
  },
};

async function handleInternalDelete(
  request: Request,
  env: Env,
  requestId: string,
) {
  if (!env.INTERNAL_WORKER_TOKEN) {
    return jsonError(503, 'internal_queue_not_configured', requestId);
  }

  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${env.INTERNAL_WORKER_TOKEN}`) {
    return jsonError(401, 'authentication_required', requestId);
  }

  const body = (await request.json()) as Partial<MediaQueueMessage>;

  if (
    body.type !== 'media_delete_requested' ||
    typeof body.assetId !== 'string' ||
    typeof body.objectKey !== 'string'
  ) {
    return jsonError(400, 'invalid_delete_job', requestId);
  }

  if (!env.MEDIA_QUEUE) {
    return jsonError(503, 'queue_not_configured', requestId);
  }

  await env.MEDIA_QUEUE.send({
    type: 'media_delete_requested',
    assetId: body.assetId,
    objectKey: body.objectKey,
    requestId,
  });

  return Response.json({ ok: true, requestId });
}

async function authorizeRequest(
  request: Request,
  env: Env,
  asset: MediaAsset,
): Promise<AuthorizationResult> {
  if (asset.visibility === 'public') {
    return { authenticated: false, allowed: true };
  }

  const token = bearerToken(request);

  if (!token) {
    return { authenticated: false, allowed: false };
  }

  const payload = await verifyJwt(token, env);

  if (asset.owner_id === payload.sub) {
    return { authenticated: true, allowed: true, userId: payload.sub };
  }

  if (asset.visibility === 'conversation_members') {
    const allowed = await checkConversationMediaAccess(
      env,
      asset.id,
      payload.sub,
    );
    return { authenticated: true, allowed, userId: payload.sub };
  }

  return { authenticated: true, allowed: false, userId: payload.sub };
}

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return undefined;
  }

  return authorization.slice('Bearer '.length);
}

async function fetchAsset(
  env: Env,
  assetId: string,
): Promise<MediaAsset | undefined> {
  const url = new URL('/rest/v1/media_assets', env.SUPABASE_URL);
  url.searchParams.set(
    'select',
    [
      'id',
      'owner_id',
      'object_key',
      'mime_type',
      'byte_size',
      'visibility',
      'status',
      'moderation_status',
      'deleted_at',
    ].join(','),
  );
  url.searchParams.set('id', `eq.${assetId}`);
  url.searchParams.set('limit', '1');

  const response = await fetch(url, {
    headers: supabaseServiceHeaders(env),
  });

  if (!response.ok) {
    throw new Error(`Supabase metadata lookup failed: ${response.status}`);
  }

  const rows = (await response.json()) as MediaAsset[];
  return rows[0];
}

async function checkConversationMediaAccess(
  env: Env,
  assetId: string,
  userId: string,
) {
  const assetMessagesUrl = new URL('/rest/v1/messages', env.SUPABASE_URL);
  assetMessagesUrl.searchParams.set('select', 'conversation_id');
  assetMessagesUrl.searchParams.set('body', `like.*${assetId}*`);
  assetMessagesUrl.searchParams.set('limit', '20');
  const response = await fetch(assetMessagesUrl, {
    headers: supabaseServiceHeaders(env),
  });

  if (!response.ok) {
    return false;
  }

  const rows = (await response.json()) as Array<{ conversation_id: string }>;
  const conversationIds = [...new Set(rows.map((row) => row.conversation_id))];

  if (conversationIds.length === 0) {
    return false;
  }

  const membershipUrl = new URL(
    '/rest/v1/conversation_members',
    env.SUPABASE_URL,
  );
  membershipUrl.searchParams.set('select', 'conversation_id');
  membershipUrl.searchParams.set('profile_id', `eq.${userId}`);
  membershipUrl.searchParams.set(
    'conversation_id',
    `in.(${conversationIds.join(',')})`,
  );
  membershipUrl.searchParams.set('limit', '1');
  const membershipResponse = await fetch(membershipUrl, {
    headers: supabaseServiceHeaders(env),
  });

  if (!membershipResponse.ok) {
    return false;
  }

  const memberships = (await membershipResponse.json()) as unknown[];
  return memberships.length > 0;
}

async function processMediaDelete(
  env: Env,
  job: Extract<MediaQueueMessage, { type: 'media_delete_requested' }>,
) {
  await env.R2_BUCKET.delete(job.objectKey);

  const url = new URL('/rest/v1/media_assets', env.SUPABASE_URL);
  url.searchParams.set('id', `eq.${job.assetId}`);
  url.searchParams.set('status', 'in.(delete_pending,deleted)');

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...supabaseServiceHeaders(env),
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify({
      status: 'deleted',
      deleted_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to mark media deleted: ${response.status}`);
  }
}

function supabaseServiceHeaders(env: Env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

async function verifyJwt(token: string, env: Env): Promise<JwtPayload> {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');

  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error('Invalid JWT format');
  }

  const header = JSON.parse(base64UrlDecode(encodedHeader)) as {
    alg: string;
    kid?: string;
  };

  if (header.alg !== 'RS256' && header.alg !== 'ES256') {
    throw new Error('Unsupported JWT algorithm');
  }

  const jwksResponse = await fetch(env.SUPABASE_JWT_JWKS_URL, {
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  const jwks = (await jwksResponse.json()) as Jwks;
  const jwk = jwks.keys.find((key) => key.kid === header.kid);

  if (!jwk) {
    throw new Error('JWT key not found');
  }

  const algorithm =
    header.alg === 'RS256'
      ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
      : { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
  const key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, [
    'verify',
  ]);
  const valid = await crypto.subtle.verify(
    algorithm,
    key,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );

  if (!valid) {
    throw new Error('Invalid JWT signature');
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload;

  if (payload.exp * 1000 < Date.now()) {
    throw new Error('JWT expired');
  }

  return payload;
}

function mediaHeaders(
  asset: MediaAsset,
  object: R2ObjectBody | R2Object,
  requestId: string,
) {
  const headers = new Headers();
  headers.set('content-type', asset.mime_type);
  headers.set('content-length', String(object.size));
  headers.set('etag', object.etag);
  headers.set('x-request-id', requestId);
  headers.set('x-content-type-options', 'nosniff');

  if (asset.visibility === 'public') {
    headers.set(
      'cache-control',
      'public, max-age=86400, stale-while-revalidate=604800',
    );
  } else {
    headers.set('cache-control', 'private, no-store');
  }

  return headers;
}

function jsonError(status: number, code: string, requestId: string) {
  return Response.json(
    { error: { code, requestId } },
    {
      status,
      headers: {
        'x-request-id': requestId,
        'cache-control': 'no-store',
      },
    },
  );
}

function base64UrlDecode(value: string) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function base64UrlToBytes(value: string) {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
