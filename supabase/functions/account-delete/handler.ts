import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  readJson,
  requireBearerToken,
} from '../_shared/platform/http.ts';
import { deleteR2Object } from '../_shared/infrastructure/r2.ts';
import {
  authenticateUser,
  enqueueOutboxEvent,
} from '../_shared/infrastructure/supabase.ts';

type DeleteAccountRequest = {
  confirmation: string;
};

type MediaAssetRow = {
  id: string;
  object_key: string;
};

type PlayerRow = {
  id: string;
};

type CleanupResult = {
  error?: string;
  name: string;
  ok: boolean;
};

export async function handleDeleteAccount(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Use POST.');
  }

  try {
    const body = await readJson<DeleteAccountRequest>(request);
    if (body.confirmation !== 'DELETE') {
      return errorResponse(
        400,
        'confirmation_required',
        'Account deletion requires explicit confirmation.',
      );
    }

    const accessToken = requireBearerToken(request);
    const { supabase, user } = await authenticateUser(accessToken);
    const profile = await supabase
      .from('profiles')
      .select('id, deleted_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profile.error) {
      return errorResponse(500, 'profile_lookup_failed', profile.error.message);
    }

    const player = await supabase
      .from('players')
      .select('id')
      .eq('account_id', user.id)
      .maybeSingle();

    if (player.error) {
      return errorResponse(500, 'player_lookup_failed', player.error.message);
    }

    const canonicalPlayer = player.data as PlayerRow | null;
    const mediaRows = await supabase
      .from('media_assets')
      .select('id, object_key')
      .eq('owner_id', user.id)
      .is('deleted_at', null);

    if (mediaRows.error) {
      return errorResponse(500, 'media_lookup_failed', mediaRows.error.message);
    }

    const media = (mediaRows.data ?? []) as MediaAssetRow[];
    const deletedAt = new Date().toISOString();
    const audit = await enqueueOutboxEvent(supabase, {
      aggregateId: user.id,
      aggregateType: 'profile',
      eventType: 'account_deletion_requested',
      payload: {
        mediaFound: media.length,
        playerFound: Boolean(canonicalPlayer),
        profileFound: Boolean(profile.data),
        requestedAt: deletedAt,
      },
    });

    if (audit.error) {
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'account_delete_audit_insert_failed',
          profileId: user.id,
          reason: audit.error.message,
        }),
      );
      return errorResponse(500, 'audit_insert_failed', audit.error.message);
    }

    for (const asset of media) {
      const deleted = await deleteR2Object(asset.object_key);
      if (!deleted.ok) {
        return errorResponse(
          502,
          'r2_delete_failed',
          'Could not delete account media from R2.',
          {
            assetId: asset.id,
            status: deleted.status,
          },
        );
      }
    }

    const cleanupResults =
      profile.data || canonicalPlayer
        ? await cleanupProfileData(
            supabase,
            user.id,
            canonicalPlayer?.id ?? null,
            deletedAt,
          )
        : [];
    const failedCleanup = cleanupResults.filter((result) => !result.ok);

    if (failedCleanup.length > 0) {
      console.error(
        JSON.stringify({
          failedCleanup,
          level: 'error',
          message: 'account_delete_cleanup_partial_failure',
          profileId: user.id,
        }),
      );
    }

    const authDelete = await supabase.auth.admin.deleteUser(user.id);
    if (authDelete.error) {
      return errorResponse(500, 'auth_delete_failed', authDelete.error.message);
    }

    return jsonResponse({
      auditLogged: true,
      cleanup: {
        attempted: cleanupResults.length,
        failed: failedCleanup.map((result) => result.name),
        succeeded: cleanupResults.filter((result) => result.ok).length,
      },
      deletedAt,
      mediaDeleted: media.length,
      playerFound: Boolean(canonicalPlayer),
      profileFound: Boolean(profile.data),
      profileId: user.id,
      status: 'deleted',
    });
  } catch (error) {
    return errorResponse(
      400,
      'bad_request',
      error instanceof Error ? error.message : 'Bad request.',
    );
  }
}

async function cleanupProfileData(
  supabase: Awaited<ReturnType<typeof authenticateUser>>['supabase'],
  profileId: string,
  playerId: string | null,
  deletedAt: string,
) {
  const operations = [
    cleanupOperation('profile_soft_delete', () =>
      supabase
        .from('profiles')
        .update({
          avatar_media_id: null,
          bio: null,
          deleted_at: deletedAt,
          display_name: 'Deleted user',
          is_discoverable: false,
        })
        .eq('id', profileId),
    ),
    cleanupOperation('profile_habits', () =>
      supabase.from('profile_habits').delete().eq('profile_id', profileId),
    ),
    cleanupOperation('profile_roles', () =>
      supabase.from('profile_roles').delete().eq('profile_id', profileId),
    ),
    cleanupOperation('profile_heroes', () =>
      supabase.from('profile_heroes').delete().eq('profile_id', profileId),
    ),
    cleanupOperation('availability_slots', () =>
      supabase.from('availability_slots').delete().eq('profile_id', profileId),
    ),
    cleanupOperation('match_preferences', () =>
      supabase.from('match_preferences').delete().eq('profile_id', profileId),
    ),
    cleanupOperation('blocks', () =>
      supabase
        .from('blocks')
        .delete()
        .or(`blocker_id.eq.${profileId},blocked_id.eq.${profileId}`),
    ),
    cleanupOperation('swipes', () =>
      supabase
        .from('swipes')
        .delete()
        .or(`actor_id.eq.${profileId},target_id.eq.${profileId}`),
    ),
    cleanupOperation('team_members', () =>
      supabase.from('team_members').delete().eq('profile_id', profileId),
    ),
    cleanupOperation('teams', () =>
      supabase.from('teams').delete().eq('owner_id', profileId),
    ),
    cleanupOperation('messages', () => {
      const messageCleanup = supabase.from('messages').update({
        body: 'Tin nhắn đã bị xoá',
        content_kind_v1: 'system',
        content_v1: { kind: 'system', eventType: 'message_removed' },
        deleted_at: deletedAt,
        media_asset_id_v1: null,
      });

      return playerId
        ? messageCleanup.or(
            `sender_id.eq.${profileId},sender_player_id_v1.eq.${playerId}`,
          )
        : messageCleanup.eq('sender_id', profileId);
    }),
    cleanupOperation('matches', () =>
      supabase
        .from('matches')
        .update({ unmatched_at: deletedAt })
        .or(`profile_low_id.eq.${profileId},profile_high_id.eq.${profileId}`),
    ),
    cleanupOperation('media_assets', () =>
      supabase
        .from('media_assets')
        .update({ deleted_at: deletedAt, status: 'deleted' })
        .eq('owner_id', profileId),
    ),
  ];

  return Promise.all(operations);
}

async function cleanupOperation(
  name: string,
  operation: () => PromiseLike<{ error: { message: string } | null }>,
): Promise<CleanupResult> {
  try {
    const result = await operation();
    if (result.error) {
      return { error: result.error.message, name, ok: false };
    }
    return { name, ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown cleanup error',
      name,
      ok: false,
    };
  }
}
