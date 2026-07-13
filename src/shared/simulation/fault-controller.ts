import type {
  ScheduledSimulationFault,
  SimulationControllerSnapshot,
  SimulationFault,
  SimulationNetworkState,
  SimulationOperationInput,
} from './contracts';
import { cloneSimulationState } from './clone';
import {
  assertValidSimulationFault,
  SimulationContractError,
  SimulationRequestError,
  simulationRequestErrorFromFault,
} from './errors';

export type SimulationDelay = (
  durationMs: number,
  signal?: AbortSignal,
) => Promise<void>;

export type PreparedSimulationOperation = {
  consumedFault: ScheduledSimulationFault | null;
  directive: Extract<
    ScheduledSimulationFault,
    { kind: 'partial_failure' | 'partial_response' }
  > | null;
};

export type SimulationFaultControllerOptions = {
  delay?: SimulationDelay;
  fixedLatencyMs?: number;
  network?: SimulationNetworkState;
};

export class SimulationFaultController {
  private readonly delay: SimulationDelay;
  private fixedLatencyMs: number;
  private readonly listeners = new Set<
    (state: SimulationNetworkState) => void
  >();
  private network: SimulationNetworkState;
  private nextFaultSequence = 0;
  private pendingFaults: ScheduledSimulationFault[] = [];

  constructor(options: SimulationFaultControllerOptions = {}) {
    this.delay = options.delay ?? defaultSimulationDelay;
    this.network = options.network ?? 'online';
    this.fixedLatencyMs = normalizeLatency(options.fixedLatencyMs ?? 0);
  }

  getNetworkState() {
    return this.network;
  }

  getFixedLatencyMs() {
    return this.fixedLatencyMs;
  }

  setNetwork(state: SimulationNetworkState) {
    if (state !== 'online' && state !== 'offline') {
      throw new SimulationContractError(
        `Unsupported simulation network state: ${String(state)}.`,
      );
    }
    if (this.network === state) return false;
    this.network = state;
    for (const listener of this.listeners) listener(state);
    return true;
  }

  subscribeNetworkState(listener: (state: SimulationNetworkState) => void) {
    this.listeners.add(listener);
    return { remove: () => this.listeners.delete(listener) };
  }

  setFixedLatency(durationMs: number) {
    const normalized = normalizeLatency(durationMs);
    if (normalized === this.fixedLatencyMs) return false;
    this.fixedLatencyMs = normalized;
    return true;
  }

  failNext(fault: SimulationFault) {
    assertValidSimulationFault(fault);
    this.nextFaultSequence += 1;
    const scheduled = cloneSimulationState({
      ...fault,
      id: `fault-${this.nextFaultSequence}`,
    }) as ScheduledSimulationFault;
    this.pendingFaults.push(scheduled);
    return cloneSimulationState(scheduled);
  }

  async prepare(
    input: SimulationOperationInput,
  ): Promise<PreparedSimulationOperation> {
    assertOperation(input.operation);
    throwIfAborted(input.signal);
    this.assertOnline(input.operation);

    if (this.fixedLatencyMs > 0) {
      await this.delay(this.fixedLatencyMs, input.signal);
      throwIfAborted(input.signal);
      this.assertOnline(input.operation);
    }

    const faultIndex = this.pendingFaults.findIndex((fault) =>
      matchesFault(fault, input),
    );
    if (faultIndex < 0) {
      return { consumedFault: null, directive: null };
    }

    const [fault] = this.pendingFaults.splice(faultIndex, 1);
    if (!fault) {
      return { consumedFault: null, directive: null };
    }

    if (fault.kind === 'latency') {
      await this.delay(fault.durationMs, input.signal);
      throwIfAborted(input.signal);
      this.assertOnline(input.operation);
      return { consumedFault: fault, directive: null };
    }

    if (fault.kind === 'timeout' && (fault.durationMs ?? 0) > 0) {
      await this.delay(fault.durationMs!, input.signal);
      throwIfAborted(input.signal);
    }

    if (fault.kind === 'partial_failure' || fault.kind === 'partial_response') {
      return { consumedFault: fault, directive: fault };
    }

    const error = simulationRequestErrorFromFault(fault, input.operation);
    if (error) throw error;
    return { consumedFault: fault, directive: null };
  }

  reset(
    options: {
      fixedLatencyMs?: number;
      network?: SimulationNetworkState;
    } = {},
  ) {
    this.pendingFaults = [];
    this.nextFaultSequence = 0;
    this.setFixedLatency(options.fixedLatencyMs ?? 0);
    this.setNetwork(options.network ?? 'online');
  }

  snapshot(): SimulationControllerSnapshot {
    return cloneSimulationState({
      fixedLatencyMs: this.fixedLatencyMs,
      network: this.network,
      nextFaultSequence: this.nextFaultSequence,
      pendingFaults: this.pendingFaults,
      version: 1 as const,
    });
  }

  restore(snapshot: SimulationControllerSnapshot) {
    if (snapshot.version !== 1) {
      throw new SimulationContractError(
        `Unsupported simulation controller snapshot version: ${String(snapshot.version)}.`,
      );
    }
    const fixedLatencyMs = normalizeLatency(snapshot.fixedLatencyMs);
    if (
      !Number.isInteger(snapshot.nextFaultSequence) ||
      snapshot.nextFaultSequence < 0
    ) {
      throw new SimulationContractError(
        'Simulation fault sequence must be a non-negative integer.',
      );
    }
    for (const fault of snapshot.pendingFaults) {
      assertValidSimulationFault(fault);
      if (!fault.id.trim()) {
        throw new SimulationContractError(
          'A scheduled simulation fault requires an id.',
        );
      }
    }

    this.pendingFaults = cloneSimulationState(snapshot.pendingFaults);
    this.nextFaultSequence = snapshot.nextFaultSequence;
    this.fixedLatencyMs = fixedLatencyMs;
    this.setNetwork(snapshot.network);
  }

  private assertOnline(operation: string) {
    if (this.network === 'online') return;
    throw new SimulationRequestError(
      'offline',
      'The simulation network is offline.',
      true,
      operation,
    );
  }
}

export async function defaultSimulationDelay(
  durationMs: number,
  signal?: AbortSignal,
) {
  if (durationMs <= 0) {
    throwIfAborted(signal);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      callback();
    };
    const timer = setTimeout(() => finish(resolve), durationMs);
    const onAbort = () => {
      clearTimeout(timer);
      finish(() => reject(abortError()));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function normalizeLatency(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new SimulationContractError(
      'Simulation fixed latency must be non-negative and finite.',
    );
  }
  return durationMs;
}

function assertOperation(operation: string) {
  if (!operation.trim()) {
    throw new SimulationContractError(
      'A simulation operation requires a non-empty name.',
    );
  }
}

function matchesFault(
  fault: ScheduledSimulationFault,
  input: SimulationOperationInput,
) {
  if (fault.operation && fault.operation !== input.operation) return false;
  if (fault.scope && fault.scope !== input.scope) return false;
  return true;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function abortError() {
  const error = new Error('The simulation operation was aborted.');
  error.name = 'AbortError';
  return error;
}
