import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  readJson,
  requireBearerToken,
} from '../_shared/http.ts';
import { authenticateUser } from '../_shared/supabase.ts';

type DeleteRequest = {
  assetId: string;
};

Deno.serve(async (request) => {
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

    await supabase
      .schema('private')
      .from('outbox_events')
      .insert({
        event_type: 'media_delete_requested',
        aggregate_type: 'media_asset',
        aggregate_id: asset.data.id,
        payload: { objectKey: asset.data.object_key },
      });

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
});
