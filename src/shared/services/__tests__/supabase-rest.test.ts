import { afterEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';

import { SupabaseRestError, supabaseRest } from '../supabase-rest';

const session: AuthSession = {
  accessToken: 'test-access-token',
  expiresAt: 4_102_444_800,
  refreshToken: 'test-refresh-token',
  tokenType: 'bearer',
  user: { id: '01000000-0000-4000-8000-000000000001' },
};

describe('supabaseRest structured errors', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves Core V1 code, request ID, retryability, and conflict details', async () => {
    const coreError = {
      code: 'profile_version_conflict',
      details: { actualVersion: 3, expectedVersion: 2 },
      message: 'Profile changed on another session.',
      requestId: 'request-profile-conflict-0001',
      retryable: true,
    };
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      response(
        {
          code: 'P0001',
          details: null,
          hint: null,
          message: JSON.stringify(coreError),
        },
        409,
      ),
    );

    const result = supabaseRest('rpc/complete_player_onboarding_v1', {
      body: { command: {} },
      method: 'POST',
      session,
    });

    await expect(result).rejects.toMatchObject({
      code: 'profile_version_conflict',
      databaseCode: 'P0001',
      details: { actualVersion: 3, expectedVersion: 2 },
      message: 'Profile changed on another session.',
      requestId: 'request-profile-conflict-0001',
      retryable: true,
      status: 409,
    } satisfies Partial<SupabaseRestError>);
  });

  it('keeps a transport request ID and derives retryability for generic failures', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response(
          { code: 'PGRST002', message: 'schema cache unavailable' },
          503,
          { 'x-request-id': 'request-transport-0001' },
        ),
      );

    await expect(
      supabaseRest('rpc/get_authenticated_player_v1', {
        method: 'POST',
        session,
      }),
    ).rejects.toMatchObject({
      code: 'PGRST002',
      databaseCode: 'PGRST002',
      requestId: 'request-transport-0001',
      retryable: true,
      status: 503,
    } satisfies Partial<SupabaseRestError>);
  });

  it('falls back to the transport envelope when a database message is not valid Core V1 JSON', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      response(
        {
          code: 'P0001',
          details: { source: 'legacy' },
          message: '{not-core-json',
        },
        400,
        { 'sb-request-id': 'request-fallback-0001' },
      ),
    );

    await expect(
      supabaseRest('rpc/legacy_command', {
        method: 'POST',
        session,
      }),
    ).rejects.toMatchObject({
      code: 'P0001',
      databaseCode: 'P0001',
      details: { source: 'legacy' },
      message: '{not-core-json',
      requestId: 'request-fallback-0001',
      retryable: false,
      status: 400,
    } satisfies Partial<SupabaseRestError>);
  });

  it('does not invent retryability for validation errors', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response({ code: '22023', message: 'invalid payload' }, 400),
      );

    await expect(
      supabaseRest('rpc/complete_player_onboarding_v1', {
        body: { command: {} },
        method: 'POST',
        session,
      }),
    ).rejects.toMatchObject({ retryable: false, status: 400 });
  });
});

function response(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return {
    headers: new Headers(headers),
    json: async () => body,
    ok: false,
    status,
  } as Response;
}
