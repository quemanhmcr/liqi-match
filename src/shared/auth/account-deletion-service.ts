import { z } from 'zod';

import { env } from '@/shared/config/env';
import {
  PlayerIdSchema,
  ProfileIdSchema,
  RequestPlayerDeletionCommandV1Schema,
} from '@/shared/contracts/core-v1';

import {
  getValidAccessToken,
  synchronizeAuthSession,
  type AuthSession,
} from './auth-service';

const AccountDeletionResultSchema = z
  .object({
    cleanup: z.object({
      attempted: z.number().int().nonnegative(),
      failed: z.array(z.string()),
      succeeded: z.number().int().nonnegative(),
    }),
    deletedAt: z.string().datetime({ offset: true }),
    lifecycleVersion: z.number().int().positive(),
    mediaDeleted: z.number().int().nonnegative(),
    playerId: PlayerIdSchema,
    profileFound: z.boolean(),
    profileId: ProfileIdSchema,
    repeated: z.boolean(),
    status: z.literal('deleted'),
  })
  .strict();

const AccountDeletionErrorEnvelopeSchema = z
  .object({
    error: z.object({
      code: z.string().min(1),
      details: z.record(z.string(), z.unknown()).optional(),
      message: z.string().min(1),
      requestId: z.string().min(1),
      retryable: z.boolean(),
    }),
  })
  .strict();

export type AccountDeletionResult = z.infer<typeof AccountDeletionResultSchema>;

export type AccountDeletionFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type AccountDeletionDependencies = Readonly<{
  fetch: AccountDeletionFetch;
  getValidAccessToken(minimumValiditySeconds?: number): Promise<string | null>;
  synchronizeAuthSession(): Promise<AuthSession | null>;
}>;

const defaultDependencies: AccountDeletionDependencies = {
  fetch: (...args) => fetch(...args),
  getValidAccessToken,
  synchronizeAuthSession,
};

export class AccountDeletionClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number | null,
    readonly retryable: boolean,
    readonly requestId: string | null,
    readonly details: Readonly<Record<string, unknown>>,
    readonly synchronizedSession: AuthSession | null,
    readonly sessionEnded: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AccountDeletionClientError';
  }
}

export async function deleteOwnAccount(
  fallbackSession: AuthSession,
  dependencies: AccountDeletionDependencies = defaultDependencies,
): Promise<AccountDeletionResult> {
  const currentSession = await synchronizeForDeletion(
    fallbackSession,
    dependencies,
  );
  const { lifecycle, principal } = requireDeletionIdentity(currentSession);
  const command = RequestPlayerDeletionCommandV1Schema.parse({
    confirmation: 'DELETE',
    expectedLifecycleVersion: lifecycle.version,
    idempotencyKey: accountDeletionIdempotencyKey(
      principal.accountId,
      lifecycle.version,
    ),
  });
  const accessToken = await dependencies.getValidAccessToken(120);
  if (!accessToken) {
    throw new AccountDeletionClientError(
      'Phiên đăng nhập đã kết thúc trước khi gửi yêu cầu xoá.',
      'session_expired',
      401,
      false,
      null,
      {},
      null,
      true,
    );
  }

  let response: Response;
  try {
    response = await dependencies.fetch(
      new URL('/functions/v1/account-delete', env.EXPO_PUBLIC_SUPABASE_URL),
      {
        body: JSON.stringify(command),
        headers: {
          apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );
  } catch (cause) {
    const synchronizedSession = await bestEffortSynchronize(dependencies);
    throw new AccountDeletionClientError(
      synchronizedSession
        ? 'Không thể xác nhận tiến độ xoá tài khoản. Vui lòng thử lại.'
        : 'Phiên đã kết thúc trong lúc xử lý xoá tài khoản.',
      synchronizedSession
        ? 'account_deletion_network_failed'
        : 'account_deletion_session_ended',
      null,
      Boolean(synchronizedSession),
      null,
      {},
      synchronizedSession,
      synchronizedSession === null,
      { cause },
    );
  }

  if (!response.ok) {
    throw await toAccountDeletionError(response, dependencies);
  }

  try {
    return AccountDeletionResultSchema.parse(await response.json());
  } catch (cause) {
    const synchronizedSession = await bestEffortSynchronize(dependencies);
    throw new AccountDeletionClientError(
      'Server trả kết quả xoá tài khoản không đúng contract.',
      'account_deletion_response_invalid',
      response.status,
      true,
      response.headers.get('x-request-id'),
      {},
      synchronizedSession,
      synchronizedSession === null,
      { cause },
    );
  }
}

export function accountDeletionIdempotencyKey(
  accountId: string,
  lifecycleVersion: number,
) {
  return `account.delete.${accountId}.v${lifecycleVersion}`;
}

async function synchronizeForDeletion(
  fallbackSession: AuthSession,
  dependencies: AccountDeletionDependencies,
): Promise<AuthSession> {
  try {
    const synchronized = await dependencies.synchronizeAuthSession();
    if (!synchronized) {
      throw new AccountDeletionClientError(
        'Phiên đăng nhập không còn hiệu lực.',
        'session_expired',
        401,
        false,
        null,
        {},
        null,
        true,
      );
    }
    return synchronized;
  } catch (cause) {
    if (cause instanceof AccountDeletionClientError) throw cause;
    throw new AccountDeletionClientError(
      'Không thể đồng bộ lifecycle trước khi xoá tài khoản.',
      'account_deletion_session_sync_failed',
      null,
      true,
      null,
      {},
      fallbackSession,
      false,
      { cause },
    );
  }
}

function requireDeletionIdentity(session: AuthSession) {
  const { lifecycle, principal } = session;
  if (
    !principal ||
    !lifecycle ||
    principal.accountId !== session.user.id ||
    principal.playerId !== lifecycle.playerId ||
    lifecycle.state === 'deleted'
  ) {
    throw new AccountDeletionClientError(
      'Session chưa có canonical identity/lifecycle hợp lệ để xoá tài khoản.',
      'account_deletion_identity_invalid',
      409,
      false,
      null,
      {},
      session,
      false,
    );
  }
  return { lifecycle, principal };
}

async function toAccountDeletionError(
  response: Response,
  dependencies: AccountDeletionDependencies,
) {
  const synchronizedSession = await bestEffortSynchronize(dependencies);
  let parsed: z.infer<typeof AccountDeletionErrorEnvelopeSchema> | null = null;
  try {
    const candidate = AccountDeletionErrorEnvelopeSchema.safeParse(
      await response.json(),
    );
    if (candidate.success) parsed = candidate.data;
  } catch {
    // Transport fallback below preserves status and x-request-id.
  }
  const serverError = parsed?.error;
  return new AccountDeletionClientError(
    serverError?.message ?? `Không thể xoá tài khoản (${response.status}).`,
    serverError?.code ?? 'account_deletion_failed',
    response.status,
    serverError?.retryable ?? response.status >= 500,
    serverError?.requestId ?? response.headers.get('x-request-id'),
    serverError?.details ?? {},
    synchronizedSession,
    synchronizedSession === null,
  );
}

async function bestEffortSynchronize(
  dependencies: AccountDeletionDependencies,
) {
  try {
    return await dependencies.synchronizeAuthSession();
  } catch {
    return null;
  }
}
