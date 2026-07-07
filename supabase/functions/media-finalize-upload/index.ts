import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  readJson,
  requireBearerToken,
} from '../_shared/http.ts';
import { headR2Object } from '../_shared/r2.ts';
import { authenticateUser } from '../_shared/supabase.ts';

type FinalizeRequest = {
  assetId: string;
};

type MediaAssetPurpose =
  'game_profile' | 'personal_avatar' | 'chat_attachment' | 'report_evidence';

Deno.serve(async (request) => {
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

    await supabase
      .schema('private')
      .from('outbox_events')
      .insert({
        event_type: 'media_uploaded',
        aggregate_type: 'media_asset',
        aggregate_id: asset.data.id,
        payload: { objectKey: asset.data.object_key },
      });

    if (!autoApproveProfileMedia) {
      await supabase
        .schema('private')
        .from('outbox_events')
        .insert({
          event_type: 'media_processing_requested',
          aggregate_type: 'media_asset',
          aggregate_id: asset.data.id,
          payload: { objectKey: asset.data.object_key },
        });
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
