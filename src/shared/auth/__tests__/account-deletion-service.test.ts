import { describe, expect, it, jest } from '@jest/globals';

import {
  AccountDeletionClientError,
  accountDeletionIdempotencyKey,
  deleteOwnAccount,
  type AccountDeletionDependencies,
  type AccountDeletionFetch,
} from '@/shared/auth/account-deletion-service';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AuthenticatedPrincipalV1Schema,
  PlayerLifecycleSnapshotV1Schema,
} from '@/shared/contracts/core-v1';

const accountId = '01000000-0000-4000-8000-000000000501';
const playerId = '20000000-0000-4000-8000-000000000501';
const profileId = '30000000-0000-4000-8000-000000000501';

function session(
  state: 'active' | 'deleting' = 'active',
  version = state === 'active' ? 3 : 4,
): AuthSession {
  return {
    accessToken: `access-${state}-${version}`,
    expiresAt: 4_102_444_800,
    lifecycle: PlayerLifecycleSnapshotV1Schema.parse({
      discoverable: state === 'active',
      messagingAllowed: state === 'active',
      playerId,
      profileId,
      state,
      updatedAt: '2099-12-31T23:00:00.000Z',
      version,
    }),
    principal: AuthenticatedPrincipalV1Schema.parse({
      accountId,
      expiresAt: '2100-01-01T00:00:00.000Z',
      issuedAt: '2099-12-31T23:00:00.000Z',
      playerId,
      sessionId: '09000000-0000-4000-8000-000000000501',
    }),
    refreshToken: `refresh-${state}-${version}`,
    tokenType: 'bearer',
    user: { email: 'delete@example.test', id: accountId },
  };
}

function successResponse() {
  return new Response(
    JSON.stringify({
      cleanup: { attempted: 13, failed: [], succeeded: 13 },
      deletedAt: '2026-07-14T08:20:00.000Z',
      lifecycleVersion: 5,
      mediaDeleted: 2,
      playerId,
      profileFound: true,
      profileId,
      repeated: false,
      status: 'deleted',
    }),
    { status: 200 },
  );
}

function dependencies(): {
  readonly value: AccountDeletionDependencies;
  readonly fetch: jest.MockedFunction<AccountDeletionFetch>;
  readonly getValidAccessToken: jest.MockedFunction<
    AccountDeletionDependencies['getValidAccessToken']
  >;
  readonly synchronizeAuthSession: jest.MockedFunction<
    AccountDeletionDependencies['synchronizeAuthSession']
  >;
} {
  const fetchMock = jest.fn<AccountDeletionFetch>();
  const getTokenMock = jest
    .fn<AccountDeletionDependencies['getValidAccessToken']>()
    .mockResolvedValue('current-access');
  const synchronizeMock =
    jest.fn<AccountDeletionDependencies['synchronizeAuthSession']>();
  return {
    fetch: fetchMock,
    getValidAccessToken: getTokenMock,
    synchronizeAuthSession: synchronizeMock,
    value: {
      fetch: fetchMock,
      getValidAccessToken: getTokenMock,
      synchronizeAuthSession: synchronizeMock,
    },
  };
}

describe('deleteOwnAccount', () => {
  it('sends the canonical lifecycle version and a version-scoped idempotency key', async () => {
    const active = session('active', 3);
    const deps = dependencies();
    deps.synchronizeAuthSession.mockResolvedValueOnce(active);
    deps.fetch.mockResolvedValueOnce(successResponse());

    await expect(deleteOwnAccount(active, deps.value)).resolves.toMatchObject({
      lifecycleVersion: 5,
      playerId,
      status: 'deleted',
    });

    expect(deps.getValidAccessToken).toHaveBeenCalledWith(120);
    expect(deps.fetch).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:54321/functions/v1/account-delete'),
      expect.objectContaining({
        body: JSON.stringify({
          confirmation: 'DELETE',
          expectedLifecycleVersion: 3,
          idempotencyKey: accountDeletionIdempotencyKey(accountId, 3),
        }),
        headers: expect.objectContaining({
          authorization: 'Bearer current-access',
        }),
        method: 'POST',
      }),
    );
  });

  it('uses the current deleting version for a resumed cleanup request', async () => {
    const deps = dependencies();
    deps.synchronizeAuthSession.mockResolvedValueOnce(session('deleting', 4));
    deps.fetch.mockResolvedValueOnce(successResponse());

    await deleteOwnAccount(session('active', 3), deps.value);

    const body = JSON.parse(
      String((deps.fetch.mock.calls[0]?.[1] as RequestInit).body),
    ) as Record<string, unknown>;
    expect(body).toEqual({
      confirmation: 'DELETE',
      expectedLifecycleVersion: 4,
      idempotencyKey: accountDeletionIdempotencyKey(accountId, 4),
    });
  });

  it('preserves structured retry details and returns the synchronized deleting session', async () => {
    const active = session('active', 3);
    const deleting = session('deleting', 4);
    const deps = dependencies();
    deps.synchronizeAuthSession
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(deleting);
    deps.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'account_deletion_cleanup_incomplete',
            details: { failed: [{ name: 'messages' }] },
            message: 'Cleanup incomplete.',
            requestId: 'request-delete-0501',
            retryable: true,
          },
        }),
        { status: 503 },
      ),
    );

    const error = await deleteOwnAccount(active, deps.value).catch(
      (caught) => caught,
    );
    expect(error).toMatchObject({
      code: 'account_deletion_cleanup_incomplete',
      details: { failed: [{ name: 'messages' }] },
      requestId: 'request-delete-0501',
      retryable: true,
      status: 503,
      synchronizedSession: deleting,
    } satisfies Partial<AccountDeletionClientError>);
  });

  it('fails before network I/O when canonical identity is absent', async () => {
    const invalid = {
      ...session(),
      lifecycle: undefined,
      principal: undefined,
    };
    const deps = dependencies();
    deps.synchronizeAuthSession.mockResolvedValueOnce(invalid);

    await expect(deleteOwnAccount(invalid, deps.value)).rejects.toMatchObject({
      code: 'account_deletion_identity_invalid',
      retryable: false,
    });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('treats a lost response plus an ended session as terminal locally', async () => {
    const active = session();
    const deps = dependencies();
    deps.synchronizeAuthSession
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(null);
    deps.fetch.mockRejectedValueOnce(new Error('network interrupted'));

    await expect(deleteOwnAccount(active, deps.value)).rejects.toMatchObject({
      code: 'account_deletion_session_ended',
      retryable: false,
      sessionEnded: true,
      synchronizedSession: null,
    });
  });
});
