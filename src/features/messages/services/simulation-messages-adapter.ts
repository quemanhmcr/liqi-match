import {
  MessageConversationResponseSchema,
  MessageInboxParamsSchema,
  MessageInboxResponseSchema,
  MessageTimelineParamsSchema,
  MessageTimelineResponseSchema,
  MessagesServiceError,
  messagesContractVersion,
  type MessageConversationDetail,
  type MessageConversationSummary,
  type MessageInboxParams,
  type MessageTimelineItem,
  type MessageTimelineParams,
  type MessagesResponse,
} from '../contracts/messages-contracts';
import type {
  ChatMessageTransport,
  ChatTransportFailureCode,
  SendChatMediaCommand,
  SendChatMessageReceipt,
  SendChatTextCommand,
} from './chat-message-transport';
import { ChatTransportError } from './chat-message-transport';
import type { ChatRepository, MessagesRequestContext } from './chat-repository';
import { previewMessagesRequestContext } from './chat-repository';
import {
  cloneSimulationState,
  SimulationRequestError,
  type SimulationJsonValue,
  type SimulationOperationContext,
  type SimulationRuntime,
} from '@/shared/simulation';

export const SIMULATION_MESSAGE_OPERATIONS = {
  conversation: 'messages.get-conversation',
  inbox: 'messages.list-conversations',
  sendMedia: 'messages.send-media',
  sendText: 'messages.send-text',
  timeline: 'messages.list-timeline',
} as const;

export type SimulationMessageProjectionContext = Readonly<{
  request: MessagesRequestContext;
  runtime: SimulationOperationContext;
}>;

export type SimulationMessagesProjection<TWorld> = {
  getConversation(
    world: Readonly<TWorld>,
    conversationId: string,
    context: SimulationMessageProjectionContext,
  ): MessageConversationDetail | null;
  getMessagePage(
    world: Readonly<TWorld>,
    conversationId: string,
    query: Required<Pick<MessageTimelineParams, 'limit'>> &
      Pick<MessageTimelineParams, 'cursor'>,
    context: SimulationMessageProjectionContext,
  ): {
    items: MessageTimelineItem[];
    pageInfo: { hasNextPage: boolean; nextCursor: string | null };
  };
  listConversations(
    world: Readonly<TWorld>,
    query: ReturnType<typeof MessageInboxParamsSchema.parse>,
    context: SimulationMessageProjectionContext,
  ): {
    items: MessageConversationSummary[];
    pageInfo: { hasNextPage: boolean; nextCursor: string | null };
    totalCount: number;
    unreadConversationCount: number;
  };
};

export type SimulationMessageMutationFailure = {
  code: ChatTransportFailureCode;
  message: string;
  retryable: boolean;
};

export type SimulationMessageMutationOutcome<TReceipt> = {
  failure?: SimulationMessageMutationFailure;
  receipt: TReceipt;
};

export type SimulationMessagesMutations<TWorld> = {
  sendMedia?(
    world: TWorld,
    command: SendChatMediaCommand,
    context: SimulationOperationContext,
  ):
    | Promise<SimulationMessageMutationOutcome<SendChatMessageReceipt>>
    | SimulationMessageMutationOutcome<SendChatMessageReceipt>;
  sendText(
    world: TWorld,
    command: SendChatTextCommand,
    context: SimulationOperationContext,
  ):
    | Promise<SimulationMessageMutationOutcome<SendChatMessageReceipt>>
    | SimulationMessageMutationOutcome<SendChatMessageReceipt>;
};

type QueuedMessageCommand =
  | { command: SendChatMediaCommand; kind: 'media' }
  | { command: SendChatTextCommand; kind: 'text' };

type SimulationOutboxItem = QueuedMessageCommand & {
  attempts: number;
  lastFailure: SimulationMessageMutationFailure | null;
  sequence: number;
  status: 'failed' | 'queued' | 'sending';
};

type SimulationMessagesAdapterSnapshot = {
  commandFingerprints: Record<string, string>;
  completedReceipts: Record<string, SendChatMessageReceipt>;
  nextOutboxSequence: number;
  outbox: SimulationOutboxItem[];
  requestSequence: number;
  version: 1;
};

export type SimulationMessagesAdapterOptions<TWorld> = {
  mutations: SimulationMessagesMutations<TWorld>;
  participantKey?: string;
  projection: SimulationMessagesProjection<TWorld>;
  runtime: SimulationRuntime<TWorld>;
};

export class SimulationMessagesAdapter<TWorld> implements ChatRepository {
  readonly transport: ChatMessageTransport;

  private readonly commandFingerprints = new Map<string, string>();
  private readonly completedReceipts = new Map<
    string,
    SendChatMessageReceipt
  >();
  private readonly inFlight = new Map<
    string,
    Promise<SendChatMessageReceipt>
  >();
  private nextOutboxSequence = 0;
  private readonly outbox = new Map<string, SimulationOutboxItem>();
  private requestSequence = 0;
  private readonly runtime: SimulationRuntime<TWorld>;
  private readonly projection: SimulationMessagesProjection<TWorld>;
  private readonly mutations: SimulationMessagesMutations<TWorld>;
  private readonly unregisterParticipant: () => void;
  private readonly networkSubscription: { remove: () => void };
  private flushPromise: Promise<void> | null = null;

  constructor(options: SimulationMessagesAdapterOptions<TWorld>) {
    this.runtime = options.runtime;
    this.projection = options.projection;
    this.mutations = options.mutations;

    this.transport = {
      getNetworkState: () => this.runtime.faults.getNetworkState(),
      sendMedia: (command) => this.sendCommand({ command, kind: 'media' }),
      sendText: (command) => this.sendCommand({ command, kind: 'text' }),
      subscribeNetworkState: (listener) =>
        this.runtime.subscribeNetworkState(listener),
    };

    this.unregisterParticipant = this.runtime.registerResetParticipant({
      key:
        options.participantKey ??
        `${this.runtime.getNamespace()}.messages-adapter`,
      reset: () => this.resetState(),
      restore: (state) => this.restoreState(state),
      snapshot: () => this.snapshotState(),
    });
    this.networkSubscription = this.runtime.subscribeNetworkState((state) => {
      if (state === 'online') void this.flushQueued();
    });
  }

  async getConversation(
    conversationId: string,
    context = previewMessagesRequestContext,
  ) {
    const data = await this.runtime
      .execute(
        {
          operation: SIMULATION_MESSAGE_OPERATIONS.conversation,
          scope: conversationId,
          signal: context.signal,
        },
        (runtimeContext) =>
          this.projection.getConversation(
            this.runtime.readWorld(),
            conversationId,
            { request: context, runtime: runtimeContext },
          ),
      )
      .catch((error) => {
        throw mapMessagesRepositoryError(error);
      });
    if (!data) return null;
    return MessageConversationResponseSchema.parse(this.response(data));
  }

  async getMessagePage(
    conversationId: string,
    input: MessageTimelineParams = {},
    context = previewMessagesRequestContext,
  ) {
    const query = MessageTimelineParamsSchema.parse(input);
    const data = await this.runtime
      .execute(
        {
          operation: SIMULATION_MESSAGE_OPERATIONS.timeline,
          scope: conversationId,
          signal: context.signal,
        },
        (runtimeContext) =>
          this.projection.getMessagePage(
            this.runtime.readWorld(),
            conversationId,
            query,
            { request: context, runtime: runtimeContext },
          ),
      )
      .catch((error) => {
        throw mapMessagesRepositoryError(error);
      });
    return MessageTimelineResponseSchema.parse(this.response(data));
  }

  async listConversations(
    input: MessageInboxParams = {},
    context = previewMessagesRequestContext,
  ) {
    const query = MessageInboxParamsSchema.parse(input);
    const data = await this.runtime
      .execute(
        {
          operation: SIMULATION_MESSAGE_OPERATIONS.inbox,
          signal: context.signal,
        },
        (runtimeContext) =>
          this.projection.listConversations(this.runtime.readWorld(), query, {
            request: context,
            runtime: runtimeContext,
          }),
      )
      .catch((error) => {
        throw mapMessagesRepositoryError(error);
      });
    return MessageInboxResponseSchema.parse(this.response(data));
  }

  listOutbox() {
    return [...this.outbox.values()]
      .sort((left, right) => left.sequence - right.sequence)
      .map((item) => cloneJsonCompatible(item));
  }

  async retry(clientMessageId: string) {
    const item = this.outbox.get(clientMessageId);
    if (!item) {
      const completed = this.completedReceipts.get(clientMessageId);
      if (completed) return cloneJsonCompatible(completed);
      throw new ChatTransportError(
        `Không tìm thấy tin nhắn chờ gửi: ${clientMessageId}.`,
        'rejected',
        false,
      );
    }
    if (item.lastFailure && !item.lastFailure.retryable) {
      throw new ChatTransportError(
        item.lastFailure.message,
        item.lastFailure.code,
        false,
      );
    }
    return this.attempt(item);
  }

  async flushQueued() {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = (async () => {
      const items = [...this.outbox.values()]
        .filter(
          (item) =>
            item.status === 'queued' ||
            (item.status === 'failed' && item.lastFailure?.retryable),
        )
        .sort((left, right) => left.sequence - right.sequence);

      for (const item of items) {
        try {
          await this.attempt(item);
        } catch (error) {
          if (error instanceof ChatTransportError && error.code === 'offline') {
            break;
          }
        }
      }
    })().finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }

  async whenIdle() {
    await this.flushPromise;
    await Promise.allSettled([...this.inFlight.values()]);
    await this.runtime.whenIdle();
  }

  dispose() {
    this.networkSubscription.remove();
    this.unregisterParticipant();
  }

  private sendCommand(command: QueuedMessageCommand) {
    const normalizedCommand = cloneJsonCompatible(command);
    const clientMessageId = normalizedCommand.command.clientMessageId;
    const fingerprint = JSON.stringify(normalizedCommand);
    const existingFingerprint = this.commandFingerprints.get(clientMessageId);
    if (existingFingerprint && existingFingerprint !== fingerprint) {
      return Promise.reject(
        new ChatTransportError(
          'Client message id đã được dùng cho một payload khác.',
          'rejected',
          false,
        ),
      );
    }
    this.commandFingerprints.set(clientMessageId, fingerprint);
    const completed = this.completedReceipts.get(clientMessageId);
    if (completed) return Promise.resolve(cloneJsonCompatible(completed));
    const current = this.inFlight.get(clientMessageId);
    if (current) return current;

    let item = this.outbox.get(clientMessageId);
    if (!item) {
      this.nextOutboxSequence += 1;
      item = {
        ...normalizedCommand,
        attempts: 0,
        lastFailure: null,
        sequence: this.nextOutboxSequence,
        status: 'queued',
      };
      this.outbox.set(clientMessageId, item);
    }
    return this.attempt(item);
  }

  private attempt(item: SimulationOutboxItem) {
    const clientMessageId = item.command.clientMessageId;
    const current = this.inFlight.get(clientMessageId);
    if (current) return current;

    item.attempts += 1;
    item.status = 'sending';
    const operation =
      item.kind === 'media'
        ? SIMULATION_MESSAGE_OPERATIONS.sendMedia
        : SIMULATION_MESSAGE_OPERATIONS.sendText;
    const promise = this.runtime
      .mutate(
        {
          operation,
          scope: item.command.conversationId,
        },
        (world, context) => {
          if (item.kind === 'media') {
            if (!this.mutations.sendMedia) {
              throw new ChatTransportError(
                'Media transport is not configured.',
                'rejected',
                false,
              );
            }
            return this.mutations.sendMedia(world, item.command, context);
          }
          return this.mutations.sendText(world, item.command, context);
        },
      )
      .then((outcome) => {
        if (outcome.failure) {
          throw new ChatTransportError(
            outcome.failure.message,
            outcome.failure.code,
            outcome.failure.retryable,
          );
        }
        const receipt = cloneJsonCompatible(outcome.receipt);
        this.completedReceipts.set(clientMessageId, receipt);
        this.outbox.delete(clientMessageId);
        return receipt;
      })
      .catch((error) => {
        const mapped = mapChatTransportError(error);
        item.lastFailure = {
          code: mapped.code,
          message: mapped.message,
          retryable: mapped.retryable,
        };
        item.status = mapped.code === 'offline' ? 'queued' : 'failed';
        throw mapped;
      })
      .finally(() => {
        this.inFlight.delete(clientMessageId);
      });

    this.inFlight.set(clientMessageId, promise);
    return promise;
  }

  private response<T>(data: T): MessagesResponse<T> {
    this.requestSequence += 1;
    return {
      contractVersion: messagesContractVersion,
      data,
      meta: {
        generatedAt: this.runtime.clock.now().toISOString(),
        requestId: `${this.runtime.getNamespace()}:messages:${this.requestSequence}`,
      },
    };
  }

  private resetState() {
    this.outbox.clear();
    this.commandFingerprints.clear();
    this.completedReceipts.clear();
    this.inFlight.clear();
    this.nextOutboxSequence = 0;
    this.requestSequence = 0;
    this.flushPromise = null;
  }

  private snapshotState(): SimulationJsonValue {
    return cloneJsonCompatible({
      commandFingerprints: Object.fromEntries(this.commandFingerprints),
      completedReceipts: Object.fromEntries(this.completedReceipts),
      nextOutboxSequence: this.nextOutboxSequence,
      outbox: this.listOutbox(),
      requestSequence: this.requestSequence,
      version: 1,
    }) as SimulationJsonValue;
  }

  private restoreState(state: SimulationJsonValue) {
    const snapshot = parseAdapterSnapshot(state);
    this.resetState();
    this.nextOutboxSequence = snapshot.nextOutboxSequence;
    this.requestSequence = snapshot.requestSequence;
    for (const item of snapshot.outbox) {
      this.outbox.set(item.command.clientMessageId, {
        ...item,
        status: item.status === 'sending' ? 'queued' : item.status,
      });
    }
    for (const [clientMessageId, fingerprint] of Object.entries(
      snapshot.commandFingerprints,
    )) {
      this.commandFingerprints.set(clientMessageId, fingerprint);
    }
    for (const [clientMessageId, receipt] of Object.entries(
      snapshot.completedReceipts,
    )) {
      this.completedReceipts.set(clientMessageId, receipt);
    }
  }
}

export function createSimulationMessagesAdapter<TWorld>(
  options: SimulationMessagesAdapterOptions<TWorld>,
) {
  return new SimulationMessagesAdapter(options);
}

export function successfulMessageMutation<
  TReceipt extends SendChatMessageReceipt,
>(receipt: TReceipt): SimulationMessageMutationOutcome<TReceipt> {
  return { receipt };
}

function mapMessagesRepositoryError(error: unknown) {
  if (error instanceof MessagesServiceError) return error;
  if (!(error instanceof SimulationRequestError)) return error;

  if (error.code === 'stale_cursor') {
    return new MessagesServiceError(
      'stale_cursor',
      error.message,
      true,
      error.fault?.id,
    );
  }
  if (error.code === 'validation_error') {
    return new MessagesServiceError(
      'validation_failed',
      error.message,
      false,
      error.fault?.id,
    );
  }
  return new MessagesServiceError(
    'network_error',
    error.message,
    error.retryable,
    error.fault?.id,
  );
}

function mapChatTransportError(error: unknown) {
  if (error instanceof ChatTransportError) return error;
  if (!(error instanceof SimulationRequestError)) {
    return new ChatTransportError('Không thể gửi tin nhắn.', 'unknown', true);
  }

  if (error.code === 'offline') {
    return new ChatTransportError(error.message, 'offline', true);
  }
  if (error.code === 'validation_error') {
    return new ChatTransportError(error.message, 'rejected', false);
  }
  if (
    error.code === 'retryable_server_error' &&
    error.fault?.kind === 'retryable_server_error' &&
    error.fault.status === 429
  ) {
    return new ChatTransportError(error.message, 'rate-limited', true);
  }
  return new ChatTransportError(error.message, 'unknown', error.retryable);
}

function cloneJsonCompatible<T>(value: T): T {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error('Message simulation state must be JSON-compatible.');
  }
  return cloneSimulationState(JSON.parse(serialized) as T);
}

function parseAdapterSnapshot(
  state: SimulationJsonValue,
): SimulationMessagesAdapterSnapshot {
  const candidate = state as Partial<SimulationMessagesAdapterSnapshot>;
  if (
    candidate.version !== 1 ||
    !Number.isInteger(candidate.nextOutboxSequence) ||
    !Number.isInteger(candidate.requestSequence) ||
    !Array.isArray(candidate.outbox) ||
    !candidate.commandFingerprints ||
    typeof candidate.commandFingerprints !== 'object' ||
    !candidate.completedReceipts ||
    typeof candidate.completedReceipts !== 'object'
  ) {
    throw new Error('Invalid simulation messages adapter snapshot.');
  }
  return cloneJsonCompatible(candidate as SimulationMessagesAdapterSnapshot);
}
