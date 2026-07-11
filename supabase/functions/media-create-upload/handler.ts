import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  readJson,
  requireBearerToken,
} from '../_shared/platform/http.ts';
import { authenticateUser } from '../_shared/infrastructure/supabase.ts';
import { presignR2Put } from '../_shared/infrastructure/r2.ts';
import {
  allowedMimeTypes,
  createObjectKey,
  extensionForMime,
  isMediaPurpose,
  maxBytesByPurpose,
  visibilityByPurpose,
} from '../_shared/domain/media-policy.ts';

type CreateUploadRequest = {
  purpose: string;
  originalFilename?: string;
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
  checksum?: string;
};

export async function handleCreateUpload(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Use POST.');
  }

  try {
    const body = await readJson<CreateUploadRequest>(request);

    if (!isMediaPurpose(body.purpose)) {
      return errorResponse(
        400,
        'invalid_purpose',
        'Unsupported media purpose.',
      );
    }

    if (!allowedMimeTypes.has(body.mimeType)) {
      return errorResponse(400, 'invalid_mime_type', 'Unsupported MIME type.');
    }

    if (
      !Number.isInteger(body.byteSize) ||
      body.byteSize <= 0 ||
      body.byteSize > maxBytesByPurpose[body.purpose]
    ) {
      return errorResponse(400, 'invalid_byte_size', 'Invalid upload size.');
    }

    const accessToken = requireBearerToken(request);
    const { supabase, user } = await authenticateUser(accessToken);
    const profile = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (profile.error || !profile.data) {
      return errorResponse(403, 'profile_required', 'Create a profile first.');
    }

    const objectKey = createObjectKey({
      ownerId: user.id,
      purpose: body.purpose,
      extension: extensionForMime(body.mimeType),
    });

    const insert = await supabase
      .from('media_assets')
      .insert({
        owner_id: user.id,
        purpose: body.purpose,
        object_key: objectKey,
        original_filename: body.originalFilename ?? null,
        mime_type: body.mimeType,
        byte_size: body.byteSize,
        width: body.width ?? null,
        height: body.height ?? null,
        checksum: body.checksum ?? null,
        visibility: visibilityByPurpose[body.purpose],
        status: 'pending',
        moderation_status: 'pending',
      })
      .select('id, object_key')
      .single();

    if (insert.error) {
      return errorResponse(500, 'media_insert_failed', insert.error.message);
    }

    const signed = await presignR2Put({
      objectKey,
      contentType: body.mimeType,
      byteSize: body.byteSize,
      checksum: body.checksum,
      expiresInSeconds: 30,
    });

    return jsonResponse({
      assetId: insert.data.id,
      objectKey: insert.data.object_key,
      uploadUrl: signed.url,
      uploadHeaders: signed.headers,
      expiresAt: signed.expiresAt,
    });
  } catch (error) {
    return errorResponse(
      400,
      'bad_request',
      error instanceof Error ? error.message : 'Bad request.',
    );
  }
}
