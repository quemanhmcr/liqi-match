import {
  AccountDeletionApplicationError,
  executeAccountDeletion,
  type AccountDeletionCleanupResult,
  type AccountDeletionCommand,
  type AccountDeletionReceipt,
} from './application.ts';
import {
  buildMessageRemovalTombstoneV1,
  buildMessageSenderIdentityFilterV1,
} from './message-tombstone.ts';
import {
  corsHeaders,
  jsonResponse,
  readJson,
  requireBearerToken,
} from '../_shared/platform/http.ts';
import { deleteR2Object } from '../_shared/infrastructure/r2.ts';
import {
  authenticateUser,
  createUserClient,
} from '../_shared/infrastructure/supabase.ts';

type MediaAssetRow = {
  id: string;
  object_key: string;
};

type PlayerRow = {
  id: string;
};

export async function handleDeleteAccount(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return deletionErrorResponse(
      new AccountDeletionApplicationError(
        'Use POST.',
        'method_not_allowed',
        405,
        false,
      ),
      crypto.randomUUID(),
    );
  }

  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    const command = await readJson<AccountDeletionCommand>(request);
    const accessToken = requireBearerToken(request);
    const { supabase, user } = await authenticateUser(accessToken);
    const userClient = createUserClient(accessToken);

    const result = await executeAccountDeletion(user.id, command, {
      now: () => new Date().toISOString(),
      async requestDeletion(input) {
        const response = await userClient.rpc('request_player_deletion_v1', {
          command: input,
        });
        if (response.error) throw mapRpcError(response.error, requestId);
        return response.data as AccountDeletionReceipt;
      },
      async lookupResources(accountId) {
        const [profile, player, mediaRows] = await Promise.all([
          supabase
            .from('profiles')
            .select('id')
            .eq('id', accountId)
            .maybeSingle(),
          supabase
            .from('players')
            .select('id')
            .eq('account_id', accountId)
            .maybeSingle(),
          supabase
            .from('media_assets')
            .select('id, object_key')
            .eq('owner_id', accountId)
            .is('deleted_at', null),
        ]);
        if (profile.error) {
          throw new AccountDeletionApplicationError(
            profile.error.message,
            'profile_lookup_failed',
            503,
            true,
            {},
            requestId,
          );
        }
        if (player.error || !player.data) {
          throw new AccountDeletionApplicationError(
            player.error?.message ?? 'Canonical PlayerId was not found.',
            player.error ? 'player_lookup_failed' : 'player_not_found',
            player.error ? 503 : 404,
            Boolean(player.error),
            {},
            requestId,
          );
        }
        if (mediaRows.error) {
          throw new AccountDeletionApplicationError(
            mediaRows.error.message,
            'media_lookup_failed',
            503,
            true,
            {},
            requestId,
          );
        }
        return {
          media: ((mediaRows.data ?? []) as MediaAssetRow[]).map((asset) => ({
            id: asset.id,
            objectKey: asset.object_key,
          })),
          playerId: (player.data as PlayerRow).id,
          profileFound: Boolean(profile.data),
        };
      },
      deleteMedia: (asset) => deleteR2Object(asset.objectKey),
      cleanupProfileData: (accountId, playerId, deletedAt) =>
        cleanupProfileData(supabase, accountId, playerId, deletedAt),
      async deleteAuthUser(accountId) {
        const deleted = await supabase.auth.admin.deleteUser(accountId);
        if (deleted.error) {
          throw new AccountDeletionApplicationError(
            deleted.error.message,
            'auth_delete_failed',
            503,
            true,
            {},
            requestId,
          );
        }
      },
    });

    return jsonResponse(result, {
      headers: { 'x-request-id': requestId },
    });
  } catch (error) {
    const applicationError = normalizeDeletionError(error, requestId);
    console.error(
      JSON.stringify({
        code: applicationError.code,
        level: 'error',
        message: 'account_deletion_failed',
        requestId: applicationError.requestId,
        retryable: applicationError.retryable,
        status: applicationError.status,
      }),
    );
    return deletionErrorResponse(applicationError, requestId);
  }
}

async function cleanupProfileData(
  supabase: Awaited<ReturnType<typeof authenticateUser>>['supabase'],
  profileId: string,
  playerId: string,
  deletedAt: string,
): Promise<readonly AccountDeletionCleanupResult[]> {
  const operations: ReadonlyArray<
    readonly [string, () => PromiseLike<{ error: { message: string } | null }>]
  > = [
    [
      'profile_soft_delete',
      () =>
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
    ],
    [
      'profile_habits',
      () =>
        supabase.from('profile_habits').delete().eq('profile_id', profileId),
    ],
    [
      'profile_roles',
      () => supabase.from('profile_roles').delete().eq('profile_id', profileId),
    ],
    [
      'profile_heroes',
      () =>
        supabase.from('profile_heroes').delete().eq('profile_id', profileId),
    ],
    [
      'availability_slots',
      () =>
        supabase
          .from('availability_slots')
          .delete()
          .eq('profile_id', profileId),
    ],
    [
      'match_preferences',
      () =>
        supabase.from('match_preferences').delete().eq('profile_id', profileId),
    ],
    [
      'blocks',
      () =>
        supabase
          .from('blocks')
          .delete()
          .or(`blocker_id.eq.${profileId},blocked_id.eq.${profileId}`),
    ],
    [
      'swipes',
      () =>
        supabase
          .from('swipes')
          .delete()
          .or(`actor_id.eq.${profileId},target_id.eq.${profileId}`),
    ],
    [
      'team_members',
      () => supabase.from('team_members').delete().eq('profile_id', profileId),
    ],
    ['teams', () => supabase.from('teams').delete().eq('owner_id', profileId)],
    [
      'messages',
      () =>
        supabase
          .from('messages')
          .update(buildMessageRemovalTombstoneV1(deletedAt))
          .or(buildMessageSenderIdentityFilterV1(profileId, playerId)),
    ],
    [
      'matches',
      () =>
        supabase
          .from('matches')
          .update({ unmatched_at: deletedAt })
          .or(`profile_low_id.eq.${profileId},profile_high_id.eq.${profileId}`),
    ],
    [
      'media_assets',
      () =>
        supabase
          .from('media_assets')
          .update({ deleted_at: deletedAt, status: 'deleted' })
          .eq('owner_id', profileId),
    ],
  ];

  const results: AccountDeletionCleanupResult[] = [];
  for (const [name, operation] of operations) {
    results.push(await cleanupOperation(name, operation));
  }
  return results;
}

async function cleanupOperation(
  name: string,
  operation: () => PromiseLike<{ error: { message: string } | null }>,
): Promise<AccountDeletionCleanupResult> {
  try {
    const result = await operation();
    return result.error
      ? { error: result.error.message, name, ok: false }
      : { name, ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown cleanup error',
      name,
      ok: false,
    };
  }
}

function mapRpcError(
  error: { code?: string; details?: string; message: string },
  fallbackRequestId: string,
) {
  try {
    const parsed = JSON.parse(error.message) as {
      code?: string;
      details?: Record<string, unknown>;
      message?: string;
      requestId?: string;
      retryable?: boolean;
    };
    return new AccountDeletionApplicationError(
      parsed.message ?? error.message,
      parsed.code ?? error.code ?? 'deletion_request_failed',
      statusForCoreError(parsed.code),
      parsed.retryable ?? false,
      parsed.details ?? {},
      parsed.requestId ?? fallbackRequestId,
    );
  } catch {
    return new AccountDeletionApplicationError(
      error.message,
      error.code ?? 'deletion_request_failed',
      503,
      true,
      error.details ? { details: error.details } : {},
      fallbackRequestId,
    );
  }
}

function statusForCoreError(code: string | undefined) {
  if (code === 'unauthenticated' || code === 'session_expired') return 401;
  if (
    code === 'lifecycle_version_conflict' ||
    code === 'idempotency_key_reused'
  ) {
    return 409;
  }
  if (code === 'validation_failed') return 400;
  if (code === 'forbidden') return 403;
  if (code === 'player_not_found') return 404;
  return 503;
}

function normalizeDeletionError(error: unknown, requestId: string) {
  if (error instanceof AccountDeletionApplicationError) return error;
  const message =
    error instanceof Error ? error.message : 'Account deletion failed.';
  if (
    message === 'Missing bearer token' ||
    message === 'Invalid access token'
  ) {
    return new AccountDeletionApplicationError(
      'Authentication is required.',
      'unauthenticated',
      401,
      false,
      {},
      requestId,
    );
  }
  if (message === 'Invalid JSON request body') {
    return new AccountDeletionApplicationError(
      message,
      'validation_failed',
      400,
      false,
      {},
      requestId,
    );
  }
  return new AccountDeletionApplicationError(
    message,
    'account_deletion_failed',
    500,
    true,
    {},
    requestId,
  );
}

function deletionErrorResponse(
  error: AccountDeletionApplicationError,
  fallbackRequestId: string,
) {
  const requestId = error.requestId ?? fallbackRequestId;
  return jsonResponse(
    {
      error: {
        code: error.code,
        details: error.details,
        message: error.message,
        requestId,
        retryable: error.retryable,
      },
    },
    {
      headers: { 'x-request-id': requestId },
      status: error.status,
    },
  );
}
