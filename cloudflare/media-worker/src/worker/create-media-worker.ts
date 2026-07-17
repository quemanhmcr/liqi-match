import { BasicImageMediaProcessor } from '../domain/media/media-processor';
import type { MediaQueueMessage } from '../domain/media/media-types';
import { SupabaseJwtVerifier } from '../infrastructure/auth/supabase-jwt-verifier';
import { CloudflareMediaQueue } from '../infrastructure/queue/cloudflare-media-queue';
import { R2MediaObjectStore } from '../infrastructure/r2/r2-media-store';
import { SupabaseMediaRepository } from '../infrastructure/supabase/supabase-rest-client';
import type { WorkerEnv } from '../platform/env';
import { jsonError } from '../transport/http/http-responses';
import { handleInternalDelete } from '../transport/http/internal-delete-handler';
import { handleInternalProcess } from '../transport/http/internal-process-handler';
import { handleMediaRequest } from '../transport/http/media-handler';
import { consumeMediaQueue } from '../transport/queue/media-queue-consumer';

export function createMediaWorker(): ExportedHandler<
  WorkerEnv,
  MediaQueueMessage
> {
  return {
    async fetch(request, env, ctx) {
      const requestId = crypto.randomUUID();
      const url = new URL(request.url);
      const repository = new SupabaseMediaRepository(env);
      const objectStore = new R2MediaObjectStore(env.R2_BUCKET);
      const queue = env.MEDIA_QUEUE
        ? new CloudflareMediaQueue(env.MEDIA_QUEUE)
        : undefined;

      try {
        if (
          request.method === 'POST' &&
          url.pathname === '/internal/media/process'
        ) {
          return await handleInternalProcess({
            internalToken: env.INTERNAL_WORKER_TOKEN,
            queue,
            request,
            requestId,
          });
        }
        if (
          request.method === 'POST' &&
          url.pathname === '/internal/media/delete'
        ) {
          return await handleInternalDelete({
            internalToken: env.INTERNAL_WORKER_TOKEN,
            queue,
            request,
            requestId,
          });
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return jsonError(405, 'method_not_allowed', requestId);
        }
        if (url.pathname === '/health') {
          return Response.json({ ok: true, env: env.MEDIA_ENV, requestId });
        }
        const match = url.pathname.match(/^\/media\/([0-9a-fA-F-]{36})$/);
        if (!match?.[1]) return jsonError(404, 'not_found', requestId);

        return await handleMediaRequest({
          assetId: match[1],
          ctx,
          dependencies: {
            identity: new SupabaseJwtVerifier(env),
            objectStore,
            processor: new BasicImageMediaProcessor(),
            queue,
            repository,
          },
          request,
          requestId,
        });
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

    async queue(batch, env) {
      await consumeMediaQueue({
        batch,
        objectStore: new R2MediaObjectStore(env.R2_BUCKET),
        repository: new SupabaseMediaRepository(env),
      });
    },
  };
}
