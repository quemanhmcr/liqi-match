import { PlaySessionCommandReceiptV2Schema } from '../../../contracts/core-v2';
import type { PlaySessionCommandService } from './play-session-repository';

export type CoreV2RpcArgs = Readonly<Record<string, unknown>>;

export interface CoreV2RpcTransport {
  invoke(input: {
    accessToken: string;
    args: CoreV2RpcArgs;
    rpcName: string;
  }): Promise<unknown>;
}

export interface CoreV2AccessTokenProvider {
  getAccessToken(): Promise<string | null>;
}

export interface CoreV2ReceiptParser {
  parse(input: unknown): unknown;
}

export class CoreV2RpcError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly retryable: boolean;

  constructor(input: {
    code: string;
    details?: unknown;
    message: string;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = 'CoreV2RpcError';
    this.code = input.code;
    this.details = input.details ?? null;
    this.retryable = input.retryable ?? false;
  }
}

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function normalizeRpcKey(key: string): string {
  if (key === 'expectedAggregateVersion') return 'p_expected_version';
  if (key === 'auditMetadata') return 'p_audit';
  return `p_${camelToSnake(key)}`;
}

export function commandToRpcArgs(command: unknown): CoreV2RpcArgs {
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    throw new CoreV2RpcError({
      code: 'validation_failed',
      message: 'Core V2 command payload must be an object.',
    });
  }

  const source = command as Record<string, unknown>;
  const flattened: Record<string, unknown> = { ...source };
  const metadata = source.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    Object.assign(flattened, metadata);
    delete flattened.metadata;
  }

  return Object.fromEntries(
    Object.entries(flattened)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [normalizeRpcKey(key), value]),
  );
}

function parsePostgrestError(payload: unknown, status: number): CoreV2RpcError {
  const record =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  const rawMessage =
    typeof record.message === 'string'
      ? record.message
      : `Core V2 RPC failed with HTTP ${status}.`;
  let authority: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(rawMessage) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      authority = parsed as Record<string, unknown>;
  } catch {
    authority = null;
  }
  return new CoreV2RpcError({
    code: typeof authority?.code === 'string' ? authority.code : 'rpc_failed',
    details: authority?.details ?? record.details ?? null,
    message:
      typeof authority?.message === 'string' ? authority.message : rawMessage,
    retryable: authority?.retryable === true || status >= 500,
  });
}

export function createSupabaseCoreV2RpcTransport(input: {
  anonKey: string;
  fetchImpl?: typeof fetch;
  supabaseUrl: string;
}): CoreV2RpcTransport {
  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrl = input.supabaseUrl.replace(/\/$/, '');
  return {
    async invoke(request) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/rpc/${request.rpcName}`,
        {
          body: JSON.stringify(request.args),
          headers: {
            apikey: input.anonKey,
            Authorization: `Bearer ${request.accessToken}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw parsePostgrestError(payload, response.status);
      return payload;
    },
  };
}

export function createSupabasePlaySessionCommandService(input: {
  accessTokenProvider: CoreV2AccessTokenProvider;
  receiptParser?: CoreV2ReceiptParser;
  transport: CoreV2RpcTransport;
}): PlaySessionCommandService {
  const receiptParser =
    input.receiptParser ?? PlaySessionCommandReceiptV2Schema;

  const execute = async <K extends keyof PlaySessionCommandService>(
    _method: K,
    rpcName: string,
    args: Parameters<
      Extract<PlaySessionCommandService[K], (...input: never[]) => unknown>
    >,
  ): Promise<
    Awaited<
      ReturnType<
        Extract<PlaySessionCommandService[K], (...input: never[]) => unknown>
      >
    >
  > => {
    const accessToken = await input.accessTokenProvider.getAccessToken();
    if (!accessToken) {
      throw new CoreV2RpcError({
        code: 'unauthenticated',
        message: 'A valid Supabase access token is required.',
      });
    }
    const command = args.at(-1);
    const response = await input.transport.invoke({
      accessToken,
      args: commandToRpcArgs(command),
      rpcName,
    });
    return receiptParser.parse(response) as Awaited<
      ReturnType<
        Extract<PlaySessionCommandService[K], (...input: never[]) => unknown>
      >
    >;
  };

  return {
    create: (...args) => execute('create', 'create_play_session_v2', args),
    createFromMatch: (...args) =>
      execute('createFromMatch', 'create_session_from_match_v2', args),
    createFromSet: (...args) =>
      execute('createFromSet', 'create_session_from_set_v2', args),
    invite: (...args) => execute('invite', 'invite_to_session_v2', args),
    acceptInvite: (...args) =>
      execute('acceptInvite', 'accept_session_invite_v2', args),
    leave: (...args) => execute('leave', 'leave_session_v2', args),
    removeMember: (...args) =>
      execute('removeMember', 'remove_session_member_v2', args),
    assignRole: (...args) =>
      execute('assignRole', 'assign_session_role_v2', args),
    openReadyCheck: (...args) =>
      execute('openReadyCheck', 'open_ready_check_v2', args),
    respondReadyCheck: (...args) =>
      execute('respondReadyCheck', 'respond_ready_check_v2', args),
    schedule: (...args) => execute('schedule', 'schedule_session_v2', args),
    start: (...args) => execute('start', 'start_session_v2', args),
    proposeCompletion: (...args) =>
      execute('proposeCompletion', 'propose_session_completion_v2', args),
    cancel: (...args) => execute('cancel', 'cancel_session_v2', args),
  };
}
