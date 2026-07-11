import type { MediaAsset } from '../../domain/media/media-types';

export function jsonError(status: number, code: string, requestId: string) {
  return Response.json(
    { error: { code, requestId } },
    {
      status,
      headers: { 'x-request-id': requestId, 'cache-control': 'no-store' },
    },
  );
}

export function mediaHeaders(
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
  headers.set(
    'cache-control',
    asset.visibility === 'public'
      ? 'public, max-age=86400, stale-while-revalidate=604800'
      : 'private, no-store',
  );
  return headers;
}

export function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : undefined;
}
