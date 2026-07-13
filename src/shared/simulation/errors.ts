import type { ScheduledSimulationFault, SimulationFault } from './contracts';

export class SimulationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimulationContractError';
  }
}

export type SimulationRequestErrorCode =
  | 'offline'
  | 'retryable_server_error'
  | 'stale_cursor'
  | 'storage_failure'
  | 'timeout'
  | 'validation_error';

export class SimulationRequestError extends Error {
  constructor(
    readonly code: SimulationRequestErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly operation: string,
    readonly fault?: ScheduledSimulationFault,
  ) {
    super(message);
    this.name = 'SimulationRequestError';
  }
}

export function simulationRequestErrorFromFault(
  fault: ScheduledSimulationFault,
  operation: string,
): SimulationRequestError | null {
  switch (fault.kind) {
    case 'retryable_server_error':
      return new SimulationRequestError(
        'retryable_server_error',
        fault.message ?? 'The simulated server request failed.',
        true,
        operation,
        fault,
      );
    case 'validation_error':
      return new SimulationRequestError(
        'validation_error',
        fault.message ?? 'The simulated request failed validation.',
        false,
        operation,
        fault,
      );
    case 'timeout':
      return new SimulationRequestError(
        'timeout',
        fault.message ?? 'The simulated request timed out.',
        true,
        operation,
        fault,
      );
    case 'storage_failure':
      return new SimulationRequestError(
        'storage_failure',
        fault.message ?? 'The simulated storage operation failed.',
        fault.retryable ?? true,
        operation,
        fault,
      );
    case 'stale_cursor':
      return new SimulationRequestError(
        'stale_cursor',
        fault.message ?? 'The simulated cursor is stale.',
        true,
        operation,
        fault,
      );
    case 'latency':
    case 'partial_failure':
    case 'partial_response':
      return null;
  }
}

export function assertValidSimulationFault(fault: SimulationFault) {
  if (!fault.kind) {
    throw new SimulationContractError('A simulation fault requires a kind.');
  }

  if (fault.operation && fault.operationPrefix) {
    throw new SimulationContractError(
      'A simulation fault cannot use operation and operationPrefix together.',
    );
  }
  if (fault.operation !== undefined && !fault.operation.trim()) {
    throw new SimulationContractError(
      'A simulation fault operation must be non-empty.',
    );
  }
  if (fault.operationPrefix !== undefined && !fault.operationPrefix.trim()) {
    throw new SimulationContractError(
      'A simulation fault operationPrefix must be non-empty.',
    );
  }
  if (fault.scope !== undefined && !fault.scope.trim()) {
    throw new SimulationContractError(
      'A simulation fault scope must be non-empty.',
    );
  }

  if (
    fault.kind === 'latency' &&
    (!Number.isFinite(fault.durationMs) || fault.durationMs < 0)
  ) {
    throw new SimulationContractError(
      'A latency fault requires a non-negative finite durationMs.',
    );
  }

  if (
    fault.kind === 'timeout' &&
    fault.durationMs !== undefined &&
    (!Number.isFinite(fault.durationMs) || fault.durationMs < 0)
  ) {
    throw new SimulationContractError(
      'A timeout fault durationMs must be non-negative and finite.',
    );
  }

  if (fault.kind === 'partial_response') {
    if (
      fault.limit !== undefined &&
      (!Number.isInteger(fault.limit) || fault.limit < 0)
    ) {
      throw new SimulationContractError(
        'A partial response limit must be a non-negative integer.',
      );
    }
    if (
      fault.ratio !== undefined &&
      (!Number.isFinite(fault.ratio) || fault.ratio < 0 || fault.ratio > 1)
    ) {
      throw new SimulationContractError(
        'A partial response ratio must be between 0 and 1.',
      );
    }
  }

  if (fault.kind === 'partial_failure' && !fault.code.trim()) {
    throw new SimulationContractError(
      'A partial failure requires a non-empty semantic code.',
    );
  }
}
