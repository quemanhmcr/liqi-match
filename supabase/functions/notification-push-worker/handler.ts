export type PushWorkerMode = 'dispatch' | 'receipts';

export type PushWorkerEnvironment = Readonly<{
  EXPO_ACCESS_TOKEN?: string;
  PUSH_WORKER_SECRET: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_URL: string;
}>;

export type RpcClient = Readonly<{
  call<T>(name: string, body: Readonly<Record<string, unknown>>): Promise<T>;
}>;

export type PushWorkerFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type PushWorkerDependencies = Readonly<{
  env: PushWorkerEnvironment;
  fetch: PushWorkerFetch;
  rpc?: RpcClient;
}>;

export type ClaimedPushJob = Readonly<{
  attempt: number;
  body: string;
  deepLink: Readonly<Record<string, unknown>>;
  jobId: string;
  kind: string;
  notificationId: string;
  recipientPlayerId: string;
  sourceEventId: string;
  title: string;
  tokens: readonly string[];
}>;

export type ClaimedPushReceipt = Readonly<{
  deliveryId: string;
  ticketId: string;
}>;

export type ExpoPushTicket = Readonly<{
  details?: Readonly<{ error?: string }>;
  id?: string;
  message?: string;
  status: 'ok' | 'error';
}>;

export type ExpoPushReceipt = ExpoPushTicket;

const expoPushSendUrl = 'https://exp.host/--/api/v2/push/send';
const expoPushReceiptsUrl = 'https://exp.host/--/api/v2/push/getReceipts';
const maxMessagesPerRequest = 100;
const maxReceiptIdsPerRequest = 1_000;

export function createNotificationPushWorkerHandler(
  dependencies: PushWorkerDependencies,
) {
  const rpc =
    dependencies.rpc ??
    createSupabaseRpcClient(dependencies.env, dependencies.fetch);

  return async (request: Request): Promise<Response> => {
    if (!hasRequiredWorkerConfiguration(dependencies.env)) {
      return jsonResponse({ error: 'push_worker_misconfigured' }, 503);
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405);
    }
    if (
      request.headers.get('x-internal-worker-secret') !==
      dependencies.env.PUSH_WORKER_SECRET
    ) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    let mode: PushWorkerMode = 'dispatch';
    try {
      const body = (await request.json()) as { mode?: unknown };
      if (body.mode === 'receipts') mode = 'receipts';
      else if (body.mode !== undefined && body.mode !== 'dispatch') {
        return jsonResponse({ error: 'invalid_mode' }, 400);
      }
    } catch {
      // Empty body uses dispatch mode.
    }

    try {
      const result =
        mode === 'dispatch'
          ? await dispatchPushJobs(dependencies, rpc)
          : await collectPushReceipts(dependencies, rpc);
      return jsonResponse({ mode, ...result });
    } catch (error) {
      console.error('Notification push worker failed.', error);
      return jsonResponse({ error: 'push_worker_failed', mode }, 500);
    }
  };
}

export async function dispatchPushJobs(
  dependencies: PushWorkerDependencies,
  rpc: RpcClient,
) {
  const jobs = await rpc.call<unknown[]>('claim_notification_push_jobs_v1', {
    p_limit: 100,
  });
  let accepted = 0;
  let errors = 0;

  for (const rawJob of jobs) {
    const job = parsePushJob(rawJob);
    try {
      const ticketResults = await sendPushJob(dependencies, job);
      const result = await rpc.call<{
        acceptedCount: number;
        errorCount: number;
      }>('record_notification_push_tickets_v1', {
        p_job_id: job.jobId,
        p_tickets: ticketResults,
      });
      accepted += result.acceptedCount;
      errors += result.errorCount;
    } catch (error) {
      errors += job.tokens.length || 1;
      await rpc.call<boolean>('fail_notification_push_job_v1', {
        p_error: errorMessage(error),
        p_job_id: job.jobId,
        p_retryable: isRetryablePushError(error),
      });
    }
  }

  return { accepted, claimedJobs: jobs.length, errors };
}

export async function collectPushReceipts(
  dependencies: PushWorkerDependencies,
  rpc: RpcClient,
) {
  const claims = (
    await rpc.call<unknown[]>('claim_notification_push_receipts_v1', {
      p_limit: maxReceiptIdsPerRequest,
    })
  ).map(parseReceiptClaim);
  if (claims.length === 0) {
    return { claimedReceipts: 0, delivered: 0, errors: 0, pending: 0 };
  }

  const providerReceipts = await fetchExpoReceipts(dependencies, claims);
  const results = claims.flatMap((claim) => {
    const receipt = providerReceipts[claim.ticketId];
    if (!receipt) return [];
    return [
      {
        deliveryId: claim.deliveryId,
        errorCode: receipt.details?.error ?? null,
        message: receipt.message ?? null,
        status: receipt.status,
        ticketId: claim.ticketId,
      },
    ];
  });
  const recorded = await rpc.call<{
    deliveredCount: number;
    errorCount: number;
  }>('record_notification_push_receipts_v1', { p_receipts: results });

  return {
    claimedReceipts: claims.length,
    delivered: recorded.deliveredCount,
    errors: recorded.errorCount,
    pending: claims.length - results.length,
  };
}

export function buildExpoPushMessages(job: ClaimedPushJob) {
  return job.tokens.map((token) => ({
    body: job.body,
    data: {
      contractVersion: 1,
      deepLink: job.deepLink,
      notificationId: job.notificationId,
      sourceEventId: job.sourceEventId,
    },
    sound: 'default',
    title: job.title,
    to: token,
  }));
}

async function sendPushJob(
  dependencies: PushWorkerDependencies,
  job: ClaimedPushJob,
) {
  if (job.tokens.length === 0) {
    throw new PushWorkerError('no_registered_push_tokens', false);
  }

  const messages = buildExpoPushMessages(job);
  const ticketResults: Array<Record<string, unknown>> = [];
  for (const chunk of chunks(messages, maxMessagesPerRequest)) {
    const response = await dependencies.fetch(expoPushSendUrl, {
      body: JSON.stringify(chunk),
      headers: expoHeaders(dependencies.env),
      method: 'POST',
    });
    if (!response.ok) {
      throw new PushWorkerError(
        `expo_push_http_${response.status}`,
        response.status === 429 || response.status >= 500,
      );
    }
    const payload = (await response.json()) as { data?: unknown };
    if (!Array.isArray(payload.data) || payload.data.length !== chunk.length) {
      throw new PushWorkerError('invalid_expo_push_ticket_response', true);
    }
    payload.data.forEach((rawTicket, index) => {
      const ticket = parseExpoTicket(rawTicket);
      ticketResults.push({
        errorCode: ticket.details?.error ?? null,
        message: ticket.message ?? null,
        status: ticket.status,
        ticketId: ticket.id ?? null,
        token: chunk[index]?.to,
      });
    });
  }
  return ticketResults;
}

async function fetchExpoReceipts(
  dependencies: PushWorkerDependencies,
  claims: readonly ClaimedPushReceipt[],
) {
  const receipts: Record<string, ExpoPushReceipt> = {};
  for (const chunk of chunks(claims, maxReceiptIdsPerRequest)) {
    const response = await dependencies.fetch(expoPushReceiptsUrl, {
      body: JSON.stringify({ ids: chunk.map((claim) => claim.ticketId) }),
      headers: expoHeaders(dependencies.env),
      method: 'POST',
    });
    if (!response.ok) {
      throw new PushWorkerError(
        `expo_receipts_http_${response.status}`,
        response.status === 429 || response.status >= 500,
      );
    }
    const payload = (await response.json()) as { data?: unknown };
    if (!payload.data || typeof payload.data !== 'object') {
      throw new PushWorkerError('invalid_expo_push_receipt_response', true);
    }
    for (const [ticketId, rawReceipt] of Object.entries(payload.data)) {
      receipts[ticketId] = parseExpoTicket(rawReceipt);
    }
  }
  return receipts;
}

function createSupabaseRpcClient(
  env: PushWorkerEnvironment,
  request: typeof fetch,
): RpcClient {
  return {
    async call<T>(name: string, body: Readonly<Record<string, unknown>>) {
      const response = await request(
        `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${name}`,
        {
          body: JSON.stringify(body),
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );
      if (!response.ok) {
        throw new Error(`supabase_rpc_${name}_${response.status}`);
      }
      return (await response.json()) as T;
    },
  };
}

function hasRequiredWorkerConfiguration(env: PushWorkerEnvironment) {
  return Boolean(
    env.PUSH_WORKER_SECRET.trim() &&
    env.SUPABASE_SERVICE_ROLE_KEY.trim() &&
    validHttpUrl(env.SUPABASE_URL),
  );
}

function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function expoHeaders(env: PushWorkerEnvironment) {
  return {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    ...(env.EXPO_ACCESS_TOKEN
      ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` }
      : {}),
    'Content-Type': 'application/json',
  };
}

function parsePushJob(value: unknown): ClaimedPushJob {
  if (!value || typeof value !== 'object') throw new Error('invalid_push_job');
  const job = value as Record<string, unknown>;
  if (
    typeof job.jobId !== 'string' ||
    typeof job.notificationId !== 'string' ||
    typeof job.sourceEventId !== 'string' ||
    typeof job.recipientPlayerId !== 'string' ||
    typeof job.kind !== 'string' ||
    typeof job.title !== 'string' ||
    typeof job.body !== 'string' ||
    !job.deepLink ||
    typeof job.deepLink !== 'object' ||
    !Array.isArray(job.tokens) ||
    !job.tokens.every((token) => typeof token === 'string') ||
    typeof job.attempt !== 'number'
  ) {
    throw new Error('invalid_push_job');
  }
  return job as unknown as ClaimedPushJob;
}

function parseReceiptClaim(value: unknown): ClaimedPushReceipt {
  if (!value || typeof value !== 'object')
    throw new Error('invalid_receipt_claim');
  const claim = value as Record<string, unknown>;
  if (
    typeof claim.deliveryId !== 'string' ||
    typeof claim.ticketId !== 'string'
  ) {
    throw new Error('invalid_receipt_claim');
  }
  return claim as unknown as ClaimedPushReceipt;
}

function parseExpoTicket(value: unknown): ExpoPushTicket {
  if (!value || typeof value !== 'object') {
    throw new PushWorkerError('invalid_expo_push_response_item', true);
  }
  const ticket = value as Record<string, unknown>;
  if (ticket.status !== 'ok' && ticket.status !== 'error') {
    throw new PushWorkerError('invalid_expo_push_response_status', true);
  }
  return {
    ...(ticket.details && typeof ticket.details === 'object'
      ? {
          details: {
            error:
              typeof (ticket.details as Record<string, unknown>).error ===
              'string'
                ? ((ticket.details as Record<string, unknown>).error as string)
                : undefined,
          },
        }
      : {}),
    ...(typeof ticket.id === 'string' ? { id: ticket.id } : {}),
    ...(typeof ticket.message === 'string' ? { message: ticket.message } : {}),
    status: ticket.status,
  };
}

function chunks<T>(items: readonly T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

class PushWorkerError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

function isRetryablePushError(error: unknown) {
  return error instanceof PushWorkerError ? error.retryable : true;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'unknown_push_worker_error';
}
