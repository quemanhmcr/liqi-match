import { authorizeMediaRequest } from '../../application/authorize-media';
import type {
  IdentityVerifier,
  MediaEventQueue,
  MediaObjectStore,
  MediaRepository,
} from '../../application/ports';
import { isReadyForDelivery } from '../../domain/media/media-access';
import type { MediaProcessor } from '../../domain/media/media-processor';
import { bearerToken, jsonError, mediaHeaders } from './http-responses';

type Dependencies = {
  identity: IdentityVerifier;
  objectStore: MediaObjectStore;
  processor: MediaProcessor;
  queue?: MediaEventQueue;
  repository: MediaRepository;
};

export async function handleMediaRequest(input: {
  assetId: string;
  ctx: ExecutionContext;
  dependencies: Dependencies;
  request: Request;
  requestId: string;
}) {
  const { dependencies, request, requestId } = input;
  const asset = await dependencies.repository.findById(input.assetId);
  if (!asset || !isReadyForDelivery(asset)) {
    return jsonError(404, 'media_not_found', requestId);
  }

  const authorization = await authorizeMediaRequest({
    asset,
    bearerToken: bearerToken(request),
    identity: dependencies.identity,
    repository: dependencies.repository,
  });
  if (asset.visibility !== 'public' && !authorization.authenticated) {
    return jsonError(401, 'authentication_required', requestId);
  }
  if (asset.visibility !== 'public' && !authorization.allowed) {
    return jsonError(404, 'media_not_found', requestId);
  }

  const object = await dependencies.objectStore.get(asset.object_key, {
    range: request.headers,
  });
  if (!object) {
    scheduleEvent(input.ctx, dependencies.queue, {
      type: 'media_object_missing',
      assetId: asset.id,
      objectKey: asset.object_key,
      requestId,
    });
    return jsonError(404, 'object_not_found', requestId);
  }
  const headers = mediaHeaders(asset, object, requestId);
  if (request.method === 'HEAD') return new Response(null, { headers });

  const sample = await dependencies.objectStore.get(asset.object_key, {
    range: { offset: 0, length: 32 },
  });
  const sampleBytes = sample
    ? new Uint8Array(await sample.arrayBuffer())
    : new Uint8Array();
  const validation = dependencies.processor.validateMagicBytes(
    sampleBytes,
    asset.mime_type,
  );
  if (!validation.ok) {
    scheduleEvent(input.ctx, dependencies.queue, {
      type: 'media_validation_failed',
      assetId: asset.id,
      objectKey: asset.object_key,
      error: validation.error,
      requestId,
    });
    return jsonError(415, 'invalid_media_bytes', requestId);
  }
  return new Response(object.body, { headers });
}

function scheduleEvent(
  ctx: ExecutionContext,
  queue: MediaEventQueue | undefined,
  event: Parameters<MediaEventQueue['send']>[0],
) {
  if (queue) ctx.waitUntil(queue.send(event));
}
