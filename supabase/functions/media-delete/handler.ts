import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  readJson,
  requireBearerToken,
} from '../_shared/platform/http.ts';
import {
  authenticateUser,
  enqueueOutboxEvent,
} from '../_shared/infrastructure/supabase.ts';

type DeleteRequest = {
  assetId: string;
};

export async function handleDeleteMedia(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Use POST.');
  }

  try {
    const { assetId } = await readJson<DeleteRequest>(request);
    const accessToken = requireBearerToken(request);
    const { supabase, user } = await authenticateUser(accessToken);
    const asset = await supabase
      .from('media_assets')
      .select('id, owner_id, object_key, status, deleted_at')
      .eq('id', assetId)
      .maybeSingle();

    if (asset.error || !asset.data || asset.data.owner_id !== user.id) {
      return errorResponse(404, 'media_not_found', 'Media asset not found.');
    }

    if (asset.data.status === 'deleted' || asset.data.deleted_at !== null) {
      return jsonResponse({
        assetId: asset.data.id,
        status: 'deleted',
        idempotent: true,
      });
    }

    const update = await supabase
      .from('media_assets')
      .update({
        status: 'delete_pending',
        deleted_at: new Date().toISOString(),
      })
      .eq('id', asset.data.id)
      .in('status', ['pending', 'uploaded', 'ready', 'rejected'])
      .select('id, status')
      .single();

    if (update.error) {
      return errorResponse(500, 'delete_mark_failed', update.error.message);
    }

    const outbox = await enqueueOutboxEvent(supabase, {
      aggregateId: asset.data.id,
      aggregateType: 'media_asset',
      eventType: 'media_delete_requested',
      payload: { objectKey: asset.data.object_key },
    });

    if (outbox.error) {
      console.error(
        JSON.stringify({
          assetId: asset.data.id,
          level: 'error',
          message: 'media_delete_outbox_enqueue_failed',
          reason: outbox.error.message,
        }),
      );
    }

    const mediaWorkerInternalUrl = Deno.env.get('MEDIA_WORKER_INTERNAL_URL');
    const mediaWorkerInternalToken = Deno.env.get(
      'MEDIA_WORKER_INTERNAL_TOKEN',
    );

    if (mediaWorkerInternalUrl && mediaWorkerInternalToken) {
      const queueResponse = await fetch(
        `${mediaWorkerInternalUrl}/internal/media/delete`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${mediaWorkerInternalToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            type: 'media_delete_requested',
            assetId: asset.data.id,
            objectKey: asset.data.object_key,
          }),
        },
      );

      if (!queueResponse.ok) {
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'media_delete_queue_enqueue_failed',
            assetId: asset.data.id,
            status: queueResponse.status,
          }),
        );
      }
    }

    return jsonResponse({
      assetId: update.data.id,
      status: update.data.status,
    });
  } catch (error) {
    return errorResponse(
      400,
      'bad_request',
      error instanceof Error ? error.message : 'Bad request.',
    );
  }
}
