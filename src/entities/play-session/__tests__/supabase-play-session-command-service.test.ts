import { describe, expect, it, jest } from '@jest/globals';

import {
  CoreV2RpcError,
  commandToRpcArgs,
  createSupabaseCoreV2RpcTransport,
  createSupabasePlaySessionCommandService,
} from '../supabase-play-session-command-service';

describe('Supabase Play Session command service', () => {
  it('normalizes shared command metadata into Postgres RPC arguments', () => {
    expect(
      commandToRpcArgs({
        auditMetadata: { appVersion: '2.0.0' },
        expectedAggregateVersion: 7,
        metadata: {
          correlationId: '97000000-0000-4000-8000-000000000001',
          idempotencyKey: 'retry-key',
        },
        optionalValue: undefined,
        sessionId: '97000000-0000-4000-8000-000000000002',
      }),
    ).toEqual({
      p_audit: { appVersion: '2.0.0' },
      p_correlation_id: '97000000-0000-4000-8000-000000000001',
      p_expected_version: 7,
      p_idempotency_key: 'retry-key',
      p_session_id: '97000000-0000-4000-8000-000000000002',
    });
  });

  it('maps manual create initial invitees to the exact PostgREST argument', async () => {
    const receipt = { aggregateId: 'receipt' };
    const invoke = jest.fn(async () => receipt);
    const service = createSupabasePlaySessionCommandService({
      accessTokenProvider: { getAccessToken: async () => 'access-token' },
      receiptParser: { parse: (value) => value },
      transport: { invoke },
    });

    await (service.create as (...args: unknown[]) => Promise<unknown>)(
      {},
      {
        audit: {
          appVersion: '2',
          clientCreatedAt: '2026-07-14T12:00:00.000Z',
          clientRequestId: '97000000-0000-4000-8000-000000000010',
          platform: 'android',
        },
        capacity: 3,
        correlationId: '97000000-0000-4000-8000-000000000011',
        expectedVersion: 0,
        idempotencyKey: 'manual-create-key-0001',
        initialInviteePlayerIds: ['97000000-0000-4000-8000-000000000012'],
        scheduledFor: null,
        timezone: 'Asia/Bangkok',
        title: 'Manual party',
      },
    );

    expect(invoke).toHaveBeenCalledWith({
      accessToken: 'access-token',
      args: expect.objectContaining({
        p_initial_invitee_player_ids: ['97000000-0000-4000-8000-000000000012'],
      }),
      rpcName: 'create_play_session_v2',
    });
  });

  it('fails closed before transport when no access token exists', async () => {
    const invoke = jest.fn(async () => undefined);
    const service = createSupabasePlaySessionCommandService({
      accessTokenProvider: { getAccessToken: async () => null },
      receiptParser: { parse: (value) => value },
      transport: { invoke },
    });

    await expect(
      (service.invite as (...args: unknown[]) => Promise<unknown>)({
        title: 'No auth',
      }),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('uses the shared method-to-RPC mapping and returns the parsed receipt', async () => {
    const receipt = { aggregateId: 'receipt' };
    const invoke = jest.fn(async () => receipt);
    const parse = jest.fn((value: unknown) => value);
    const service = createSupabasePlaySessionCommandService({
      accessTokenProvider: { getAccessToken: async () => 'access-token' },
      receiptParser: { parse },
      transport: { invoke },
    });

    await expect(
      (service.invite as (...args: unknown[]) => Promise<unknown>)({
        expectedVersion: 0,
        title: 'Manual session',
      }),
    ).resolves.toEqual(receipt);
    expect(invoke).toHaveBeenCalledWith({
      accessToken: 'access-token',
      args: { p_expected_version: 0, p_title: 'Manual session' },
      rpcName: 'invite_to_session_v2',
    });
    expect(parse).toHaveBeenCalledWith(receipt);
  });

  it('preserves stable authoritative error codes without message branching', async () => {
    const fetchImpl = jest.fn(
      async () =>
        ({
          json: async () => ({
            message: JSON.stringify({
              code: 'version_conflict',
              details: { actualVersion: 4, expectedVersion: 3 },
              message: 'The aggregate version changed.',
              retryable: false,
            }),
          }),
          ok: false,
          status: 409,
        }) as Response,
    ) as unknown as typeof fetch;
    const transport = createSupabaseCoreV2RpcTransport({
      anonKey: 'anon-key',
      fetchImpl,
      supabaseUrl: 'https://example.supabase.co/',
    });

    await expect(
      transport.invoke({
        accessToken: 'access-token',
        args: {},
        rpcName: 'schedule_session_v2',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'version_conflict',
        details: { actualVersion: 4, expectedVersion: 3 },
        retryable: false,
      }),
    );
  });

  it('marks opaque server failures retryable', async () => {
    const fetchImpl = jest.fn(
      async () =>
        ({
          json: async () => ({ message: 'gateway unavailable' }),
          ok: false,
          status: 503,
        }) as Response,
    ) as unknown as typeof fetch;
    const transport = createSupabaseCoreV2RpcTransport({
      anonKey: 'anon-key',
      fetchImpl,
      supabaseUrl: 'https://example.supabase.co',
    });

    await expect(
      transport.invoke({
        accessToken: 'access-token',
        args: {},
        rpcName: 'start_session_v2',
      }),
    ).rejects.toBeInstanceOf(CoreV2RpcError);
    await transport
      .invoke({
        accessToken: 'access-token',
        args: {},
        rpcName: 'start_session_v2',
      })
      .catch((error: unknown) =>
        expect(error).toMatchObject({ code: 'rpc_failed', retryable: true }),
      );
  });
});
