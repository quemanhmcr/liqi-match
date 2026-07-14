import { describe, expect, it, jest } from '@jest/globals';

import {
  buildExpoPushMessages,
  collectPushReceipts,
  createNotificationPushWorkerHandler,
  dispatchPushJobs,
  type ClaimedPushJob,
  type PushWorkerDependencies,
  type RpcClient,
} from '../../supabase/functions/notification-push-worker/handler';

const job: ClaimedPushJob = {
  attempt: 1,
  body: 'Bạn có tin nhắn mới',
  deepLink: {
    conversationId: '60000000-0000-4000-8000-000000000001',
    target: 'conversation',
  },
  jobId: 'a0000000-0000-4000-8000-000000000001',
  kind: 'message_received',
  notificationId: '90000000-0000-4000-8000-000000000001',
  recipientPlayerId: '20000000-0000-4000-8000-000000000001',
  sourceEventId: '80000000-0000-4000-8000-000000000001',
  title: 'Tin nhắn mới',
  tokens: ['ExponentPushToken[token-1]', 'ExponentPushToken[token-2]'],
};

function dependencies(
  fetchImplementation: typeof fetch,
): PushWorkerDependencies {
  return {
    env: {
      EXPO_ACCESS_TOKEN: 'expo-access-token',
      PUSH_WORKER_SECRET: 'worker-secret',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      SUPABASE_URL: 'https://project.supabase.co',
    },
    fetch: fetchImplementation,
  };
}

type RecordedRpcCall = (
  name: string,
  body: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

function rpcWith(implementation: RecordedRpcCall) {
  const recordedCall = jest.fn<RecordedRpcCall>(implementation);
  const rpc: RpcClient = {
    async call<T>(name: string, body: Readonly<Record<string, unknown>>) {
      return (await recordedCall(name, body)) as T;
    },
  };
  return { ...rpc, recordedCall };
}

describe('notification push worker', () => {
  it('builds the exact machine-readable navigation payload for every device', () => {
    expect(buildExpoPushMessages(job)).toEqual([
      expect.objectContaining({
        data: {
          contractVersion: 1,
          deepLink: job.deepLink,
          notificationId: job.notificationId,
          sourceEventId: job.sourceEventId,
        },
        to: job.tokens[0],
      }),
      expect.objectContaining({ to: job.tokens[1] }),
    ]);
  });

  it('records provider tickets per token after a successful dispatch', async () => {
    const fetchMock = jest.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 'ticket-1', status: 'ok' },
            {
              details: { error: 'DeviceNotRegistered' },
              message: 'Device is not registered',
              status: 'error',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const rpc = rpcWith(async (name) => {
      if (name === 'claim_notification_push_jobs_v1') return [job];
      if (name === 'record_notification_push_tickets_v1') {
        return { acceptedCount: 1, errorCount: 1 };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(
      dispatchPushJobs(dependencies(fetchMock), rpc),
    ).resolves.toEqual({ accepted: 1, claimedJobs: 1, errors: 1 });
    expect(rpc.recordedCall).toHaveBeenCalledWith(
      'record_notification_push_tickets_v1',
      {
        p_job_id: job.jobId,
        p_tickets: [
          {
            errorCode: null,
            message: null,
            status: 'ok',
            ticketId: 'ticket-1',
            token: job.tokens[0],
          },
          {
            errorCode: 'DeviceNotRegistered',
            message: 'Device is not registered',
            status: 'error',
            ticketId: null,
            token: job.tokens[1],
          },
        ],
      },
    );
  });

  it('returns a retryable job failure for Expo throttling', async () => {
    const fetchMock = jest.fn<typeof fetch>();
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));
    const rpc = rpcWith(async (name) => {
      if (name === 'claim_notification_push_jobs_v1') return [job];
      if (name === 'fail_notification_push_job_v1') return true;
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(
      dispatchPushJobs(dependencies(fetchMock), rpc),
    ).resolves.toEqual({ accepted: 0, claimedJobs: 1, errors: 2 });
    expect(rpc.recordedCall).toHaveBeenCalledWith(
      'fail_notification_push_job_v1',
      {
        p_error: 'expo_push_http_429',
        p_job_id: job.jobId,
        p_retryable: true,
      },
    );
  });

  it('records ready receipts and leaves missing receipts leased for retry', async () => {
    const fetchMock = jest.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { 'ticket-1': { status: 'ok' } } }), {
        status: 200,
      }),
    );
    const rpc = rpcWith(async (name) => {
      if (name === 'claim_notification_push_receipts_v1') {
        return [
          { deliveryId: 'delivery-1', ticketId: 'ticket-1' },
          { deliveryId: 'delivery-2', ticketId: 'ticket-2' },
        ];
      }
      if (name === 'record_notification_push_receipts_v1') {
        return { deliveredCount: 1, errorCount: 0 };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(
      collectPushReceipts(dependencies(fetchMock), rpc),
    ).resolves.toEqual({
      claimedReceipts: 2,
      delivered: 1,
      errors: 0,
      pending: 1,
    });
    expect(rpc.recordedCall).toHaveBeenCalledWith(
      'record_notification_push_receipts_v1',
      {
        p_receipts: [
          {
            deliveryId: 'delivery-1',
            errorCode: null,
            message: null,
            status: 'ok',
            ticketId: 'ticket-1',
          },
        ],
      },
    );
  });

  it('fails closed when required worker configuration is missing', async () => {
    const handler = createNotificationPushWorkerHandler({
      env: {
        PUSH_WORKER_SECRET: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        SUPABASE_URL: '',
      },
      fetch: jest.fn<typeof fetch>(),
    });

    const response = await handler(
      new Request('https://worker.test', {
        headers: { 'x-internal-worker-secret': '' },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'push_worker_misconfigured',
    });
  });

  it('requires the internal worker secret and supports explicit receipt mode', async () => {
    const rpc = rpcWith(async (name) => {
      if (name === 'claim_notification_push_receipts_v1') return [];
      throw new Error(`Unexpected RPC ${name}`);
    });
    const handler = createNotificationPushWorkerHandler({
      ...dependencies(jest.fn<typeof fetch>()),
      rpc,
    });

    await expect(
      handler(new Request('https://worker.test', { method: 'POST' })),
    ).resolves.toMatchObject({ status: 401 });
    const response = await handler(
      new Request('https://worker.test', {
        body: JSON.stringify({ mode: 'receipts' }),
        headers: { 'x-internal-worker-secret': 'worker-secret' },
        method: 'POST',
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      claimedReceipts: 0,
      mode: 'receipts',
    });
  });
});
