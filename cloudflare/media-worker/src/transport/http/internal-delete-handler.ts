import type { MediaEventQueue } from '../../application/ports';
import type { MediaQueueMessage } from '../../domain/media/media-types';
import { jsonError } from './http-responses';

export async function handleInternalDelete(input: {
  internalToken?: string;
  queue?: MediaEventQueue;
  request: Request;
  requestId: string;
}) {
  if (!input.internalToken) {
    return jsonError(503, 'internal_queue_not_configured', input.requestId);
  }
  if (
    input.request.headers.get('authorization') !==
    `Bearer ${input.internalToken}`
  ) {
    return jsonError(401, 'authentication_required', input.requestId);
  }
  const body = (await input.request.json()) as Partial<MediaQueueMessage>;
  if (
    body.type !== 'media_delete_requested' ||
    typeof body.assetId !== 'string' ||
    typeof body.objectKey !== 'string'
  ) {
    return jsonError(400, 'invalid_delete_job', input.requestId);
  }
  if (!input.queue) {
    return jsonError(503, 'queue_not_configured', input.requestId);
  }
  await input.queue.send({
    type: 'media_delete_requested',
    assetId: body.assetId,
    objectKey: body.objectKey,
    requestId: input.requestId,
  });
  return Response.json({ ok: true, requestId: input.requestId });
}
