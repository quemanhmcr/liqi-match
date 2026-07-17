import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  readJson,
  requireBearerToken,
} from '../_shared/platform/http.ts';
import { headR2Object } from '../_shared/infrastructure/r2.ts';
import {
  authenticateUser,
  enqueueOutboxEvent,
} from '../_shared/infrastructure/supabase.ts';

type FinalizeRequest = {
  assetId: string;
};

type MediaAssetPurpose =
  'game_profile' | 'personal_avatar' | 'chat_attachment' | 'report_evidence';

export async function handleFinalizeUpload(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Use POST.');
  }

  try {
    const { assetId } = await readJson<FinalizeRequest>(request);
    const accessToken = requireBearerToken(request);
    const { supabase, user } = await authenticateUser(accessToken);
    const asset = await supabase
      .from('media_assets')
      .select(
        'id, owner_id, object_key, mime_type, byte_size, purpose, status, moderation_status',
      )
      .eq('id', assetId)
      .maybeSingle();

    if (asset.error || !asset.data || asset.data.owner_id !== user.id) {
      return errorResponse(404, 'media_not_found', 'Media asset not found.');
    }

    const autoApproveProfileMedia = shouldAutoApproveProfileMedia(
      asset.data.purpose,
    );

    if (asset.data.status === 'ready') {
      return jsonResponse({
        assetId: asset.data.id,
        status: asset.data.status,
        idempotent: true,
      });
    }

    if (asset.data.status === 'uploaded' && autoApproveProfileMedia) {
      const promoted = await promoteProfileMediaAsset(
        supabase,
        asset.data.id,
        asset.data.status,
      );

      if (promoted.error) {
        return errorResponse(500, 'finalize_failed', promoted.error.message);
      }

      return jsonResponse({
        assetId: promoted.data.id,
        status: promoted.data.status,
        idempotent: true,
      });
    }

    if (asset.data.status === 'uploaded') {
      await enqueueMediaProcessingJob({
        assetId: asset.data.id,
        objectKey: asset.data.object_key,
      });
      return jsonResponse({
        assetId: asset.data.id,
        status: asset.data.status,
        idempotent: true,
      });
    }

    if (asset.data.status !== 'pending') {
      return errorResponse(409, 'invalid_status', 'Asset cannot be finalized.');
    }

    const object = await headR2Object(asset.data.object_key);

    if (!object.ok) {
      return errorResponse(409, 'object_missing', 'Uploaded object not found.');
    }

    if (
      object.byteSize !== asset.data.byte_size ||
      object.contentType !== asset.data.mime_type
    ) {
      return errorResponse(
        409,
        'object_mismatch',
        'Uploaded object metadata differs.',
      );
    }

    const update = autoApproveProfileMedia
      ? await promoteProfileMediaAsset(supabase, asset.data.id, 'pending')
      : await supabase
          .from('media_assets')
          .update({ status: 'uploaded' })
          .eq('id', asset.data.id)
          .eq('status', 'pending')
          .select('id, status')
          .single();

    if (update.error) {
      return errorResponse(500, 'finalize_failed', update.error.message);
    }

    await enqueueMediaOutboxEvent(supabase, {
      aggregateId: asset.data.id,
      eventType: 'media_uploaded',
      objectKey: asset.data.object_key,
    });

    if (!autoApproveProfileMedia) {
      await enqueueMediaOutboxEvent(supabase, {
        aggregateId: asset.data.id,
        eventType: 'media_processing_requested',
        objectKey: asset.data.object_key,
      });
      await enqueueMediaProcessingJob({
        assetId: asset.data.id,
        objectKey: asset.data.object_key,
      });
    }

    return jsonResponse({
      assetId: update.data.id,
      status: update.data.status,
    });
  } catch (error) {
    if (error instanceof MediaProcessingQueueError) {
      return errorResponse(
        503,
        'media_processing_unavailable',
        'Media was uploaded but processing could not be scheduled. Retry finalize.',
      );
    }
    return errorResponse(
      400,
      'bad_request',
      error instanceof Error ? error.message : 'Bad request.',
    );
  }
}

class MediaProcessingQueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaProcessingQueueError';
  }
}

function shouldAutoApproveProfileMedia(purpose: MediaAssetPurpose) {
  return purpose === 'personal_avatar' || purpose === 'game_profile';
}

function promoteProfileMediaAsset(
  supabase: Awaited<ReturnType<typeof authenticateUser>>['supabase'],
  assetId: string,
  expectedStatus: 'pending' | 'uploaded',
) {
  return supabase
    .from('media_assets')
    .update({
      moderation_status: 'approved',
      status: 'ready',
    })
    .eq('id', assetId)
    .eq('status', expectedStatus)
    .select('id, status')
    .single();
}

async function enqueueMediaProcessingJob(input: {
  assetId: string;
  objectKey: string;
}) {
  const mediaWorkerInternalUrl = Deno.env.get('MEDIA_WORKER_INTERNAL_URL');
  const mediaWorkerInternalToken = Deno.env.get('MEDIA_WORKER_INTERNAL_TOKEN');
  if (!mediaWorkerInternalUrl || !mediaWorkerInternalToken) {
    console.error(
      JSON.stringify({
        assetId: input.assetId,
        level: 'error',
        message: 'media_processing_queue_not_configured',
      }),
    );
    throw new MediaProcessingQueueError(
      'Media processing queue is not configured.',
    );
  }

  try {
    const baseUrl = mediaWorkerInternalUrl.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/internal/media/process`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${mediaWorkerInternalToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'media_processing_requested',
        assetId: input.assetId,
        objectKey: input.objectKey,
      }),
    });
    if (!response.ok) {
      console.error(
        JSON.stringify({
          assetId: input.assetId,
          level: 'error',
          message: 'media_processing_queue_enqueue_failed',
          status: response.status,
        }),
      );
      throw new MediaProcessingQueueError(
        `Media processing queue returned ${response.status}.`,
      );
    }
  } catch (error) {
    if (error instanceof MediaProcessingQueueError) throw error;
    console.error(
      JSON.stringify({
        assetId: input.assetId,
        level: 'error',
        message: 'media_processing_queue_enqueue_failed',
        reason: error instanceof Error ? error.message : 'unknown_error',
      }),
    );
    throw new MediaProcessingQueueError(
      error instanceof Error ? error.message : 'Unknown queue error.',
    );
  }
}

async function enqueueMediaOutboxEvent(
  supabase: Awaited<ReturnType<typeof authenticateUser>>['supabase'],
  input: {
    aggregateId: string;
    eventType: 'media_processing_requested' | 'media_uploaded';
    objectKey: string;
  },
) {
  const outbox = await enqueueOutboxEvent(supabase, {
    aggregateId: input.aggregateId,
    aggregateType: 'media_asset',
    eventType: input.eventType,
    payload: { objectKey: input.objectKey },
  });

  if (outbox.error) {
    console.error(
      JSON.stringify({
        assetId: input.aggregateId,
        eventType: input.eventType,
        level: 'error',
        message: 'media_finalize_outbox_enqueue_failed',
        reason: outbox.error.message,
      }),
    );
  }
}
