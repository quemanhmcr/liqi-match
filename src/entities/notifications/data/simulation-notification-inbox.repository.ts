import type {
  GetNotificationInboxSummaryInput,
  ListNotificationInboxInput,
  MarkNotificationReadInput,
  MarkNotificationReadResult,
  MarkNotificationsSeenInput,
  MarkNotificationsSeenResult,
  NotificationInboxPage,
  NotificationInboxRepository,
  NotificationInboxSummary,
} from '../model/notification';
import {
  SimulationRequestError,
  type SimulationOperationContext,
  type SimulationRuntime,
} from '@/shared/simulation';

export const SIMULATION_NOTIFICATION_OPERATIONS = {
  list: 'notifications.list',
  markRead: 'notifications.mark-read',
  markSeen: 'notifications.mark-seen-through',
  summary: 'notifications.summary',
} as const;

export type NotificationSimulationErrorCode =
  | 'network_error'
  | 'stale_cursor'
  | 'storage_error'
  | 'timeout'
  | 'unknown'
  | 'validation_error';

export class NotificationSimulationError extends Error {
  constructor(
    readonly code: NotificationSimulationErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly faultId?: string,
  ) {
    super(message);
    this.name = 'NotificationSimulationError';
  }
}

export type SimulationNotificationLens<TWorld> = {
  getSummary(
    world: Readonly<TWorld>,
    input: GetNotificationInboxSummaryInput,
    context: SimulationOperationContext,
  ): Promise<NotificationInboxSummary> | NotificationInboxSummary;
  list(
    world: Readonly<TWorld>,
    input: ListNotificationInboxInput,
    context: SimulationOperationContext,
  ): Promise<NotificationInboxPage> | NotificationInboxPage;
  markRead(
    world: TWorld,
    input: MarkNotificationReadInput,
    context: SimulationOperationContext,
  ): Promise<MarkNotificationReadResult> | MarkNotificationReadResult;
  markSeenThrough(
    world: TWorld,
    input: MarkNotificationsSeenInput,
    context: SimulationOperationContext,
  ): Promise<MarkNotificationsSeenResult> | MarkNotificationsSeenResult;
};

export type SimulationNotificationInboxRepositoryOptions<TWorld> = {
  lens: SimulationNotificationLens<TWorld>;
  runtime: SimulationRuntime<TWorld>;
};

/**
 * Runtime-backed mutable Notifications adapter. Notification meaning,
 * watermark ordering and invariants stay in the injected world lens.
 */
export class SimulationNotificationInboxRepository<
  TWorld,
> implements NotificationInboxRepository {
  private readonly lens: SimulationNotificationLens<TWorld>;
  private readonly runtime: SimulationRuntime<TWorld>;

  constructor(options: SimulationNotificationInboxRepositoryOptions<TWorld>) {
    this.lens = options.lens;
    this.runtime = options.runtime;
  }

  async getSummary(input: GetNotificationInboxSummaryInput) {
    return this.runtime
      .execute(
        {
          operation: SIMULATION_NOTIFICATION_OPERATIONS.summary,
          scope: input.session.user.id,
          signal: input.signal,
        },
        (context) =>
          this.lens.getSummary(this.runtime.readWorld(), input, context),
      )
      .catch((error) => {
        throw mapNotificationSimulationError(error);
      });
  }

  async list(input: ListNotificationInboxInput) {
    return this.runtime
      .execute(
        {
          operation: SIMULATION_NOTIFICATION_OPERATIONS.list,
          scope: input.session.user.id,
          signal: input.signal,
        },
        (context) => this.lens.list(this.runtime.readWorld(), input, context),
      )
      .catch((error) => {
        throw mapNotificationSimulationError(error);
      });
  }

  async markRead(input: MarkNotificationReadInput) {
    return this.runtime
      .mutate(
        {
          operation: SIMULATION_NOTIFICATION_OPERATIONS.markRead,
          scope: input.notificationId,
          signal: input.signal,
        },
        (world, context) => this.lens.markRead(world, input, context),
      )
      .catch((error) => {
        throw mapNotificationSimulationError(error);
      });
  }

  async markSeenThrough(input: MarkNotificationsSeenInput) {
    return this.runtime
      .mutate(
        {
          operation: SIMULATION_NOTIFICATION_OPERATIONS.markSeen,
          scope: input.session.user.id,
          signal: input.signal,
        },
        (world, context) => this.lens.markSeenThrough(world, input, context),
      )
      .catch((error) => {
        throw mapNotificationSimulationError(error);
      });
  }
}

export function createSimulationNotificationInboxRepository<TWorld>(
  options: SimulationNotificationInboxRepositoryOptions<TWorld>,
) {
  return new SimulationNotificationInboxRepository(options);
}

export function partialSimulationItems<T>(
  items: readonly T[],
  context: Pick<SimulationOperationContext, 'fault'>,
) {
  if (context.fault?.kind !== 'partial_response') return [...items];
  if (context.fault.limit !== undefined) {
    return items.slice(0, context.fault.limit);
  }
  const ratio = context.fault.ratio ?? 0.5;
  return items.slice(0, Math.floor(items.length * ratio));
}

function mapNotificationSimulationError(error: unknown) {
  if (error instanceof NotificationSimulationError) return error;
  if (!(error instanceof SimulationRequestError)) {
    return new NotificationSimulationError(
      'unknown',
      error instanceof Error
        ? error.message
        : 'Notification simulation failed.',
      false,
    );
  }

  switch (error.code) {
    case 'offline':
    case 'retryable_server_error':
      return new NotificationSimulationError(
        'network_error',
        error.message,
        error.retryable,
        error.fault?.id,
      );
    case 'timeout':
      return new NotificationSimulationError(
        'timeout',
        error.message,
        true,
        error.fault?.id,
      );
    case 'storage_failure':
      return new NotificationSimulationError(
        'storage_error',
        error.message,
        error.retryable,
        error.fault?.id,
      );
    case 'stale_cursor':
      return new NotificationSimulationError(
        'stale_cursor',
        error.message,
        true,
        error.fault?.id,
      );
    case 'validation_error':
      return new NotificationSimulationError(
        'validation_error',
        error.message,
        false,
        error.fault?.id,
      );
  }
}
