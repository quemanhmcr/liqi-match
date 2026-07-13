import type { SimulationClock, SimulationClockSnapshot } from './contracts';
import { SimulationContractError } from './errors';

export class DeterministicSimulationClock implements SimulationClock {
  private baselineMs: number;
  private currentMs: number;

  constructor(initialAt: string) {
    this.baselineMs = simulationTimestampMs(initialAt, 'initial clock');
    this.currentMs = this.baselineMs;
  }

  now() {
    return new Date(this.currentMs);
  }

  freeze(at: string) {
    this.currentMs = simulationTimestampMs(at, 'frozen clock');
  }

  advance(durationMs: number) {
    this.currentMs = advancedSimulationTimestampMs(
      this.currentMs,
      durationMs,
      'clock durationMs',
    );
  }

  reset() {
    this.currentMs = this.baselineMs;
  }

  setBaseline(at: string) {
    this.baselineMs = simulationTimestampMs(at, 'clock baseline');
    this.currentMs = this.baselineMs;
  }

  snapshot(): SimulationClockSnapshot {
    return {
      baselineAt: simulationTimestampIso(this.baselineMs),
      currentAt: simulationTimestampIso(this.currentMs),
      version: 1,
    };
  }

  restore(snapshot: SimulationClockSnapshot) {
    if (snapshot.version !== 1) {
      throw new SimulationContractError(
        `Unsupported simulation clock snapshot version: ${String(snapshot.version)}.`,
      );
    }
    this.baselineMs = simulationTimestampMs(
      snapshot.baselineAt,
      'clock baseline',
    );
    this.currentMs = simulationTimestampMs(
      snapshot.currentAt,
      'clock current time',
    );
  }
}

export function simulationTimestampMs(value: string, label = 'timestamp') {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new SimulationContractError(
      `The ${label} must be a valid ISO-compatible timestamp.`,
    );
  }
  return timestamp;
}

export function simulationTimestampIso(timestampMs: number) {
  if (!Number.isFinite(timestampMs)) {
    throw new SimulationContractError('A simulation timestamp must be finite.');
  }
  return new Date(timestampMs).toISOString();
}

export function offsetSimulationTimestamp(
  at: string,
  offsetMs: number,
  label = 'offsetMs',
) {
  if (!Number.isFinite(offsetMs)) {
    throw new SimulationContractError(`${label} must be finite.`);
  }
  const shifted = simulationTimestampMs(at) + offsetMs;
  if (!Number.isFinite(shifted)) {
    throw new SimulationContractError('Simulation clock overflowed.');
  }
  return simulationTimestampIso(shifted);
}

export function shiftSimulationTimestamp(
  at: string,
  durationMs: number,
  label = 'durationMs',
) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new SimulationContractError(
      `${label} must be non-negative and finite.`,
    );
  }
  return offsetSimulationTimestamp(at, durationMs, label);
}

function advancedSimulationTimestampMs(
  timestampMs: number,
  durationMs: number,
  label: string,
) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new SimulationContractError(
      `${label} must be non-negative and finite.`,
    );
  }
  const advanced = timestampMs + durationMs;
  if (!Number.isFinite(advanced)) {
    throw new SimulationContractError('Simulation clock overflowed.');
  }
  return advanced;
}
