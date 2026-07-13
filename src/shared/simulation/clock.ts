import type { SimulationClock, SimulationClockSnapshot } from './contracts';
import { SimulationContractError } from './errors';

export class DeterministicSimulationClock implements SimulationClock {
  private baselineMs: number;
  private currentMs: number;

  constructor(initialAt: string) {
    this.baselineMs = parseTimestamp(initialAt, 'initial clock');
    this.currentMs = this.baselineMs;
  }

  now() {
    return new Date(this.currentMs);
  }

  freeze(at: string) {
    this.currentMs = parseTimestamp(at, 'frozen clock');
  }

  advance(durationMs: number) {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new SimulationContractError(
        'Clock durationMs must be non-negative and finite.',
      );
    }
    this.currentMs += durationMs;
  }

  reset() {
    this.currentMs = this.baselineMs;
  }

  setBaseline(at: string) {
    this.baselineMs = parseTimestamp(at, 'clock baseline');
    this.currentMs = this.baselineMs;
  }

  snapshot(): SimulationClockSnapshot {
    return {
      baselineAt: new Date(this.baselineMs).toISOString(),
      currentAt: new Date(this.currentMs).toISOString(),
      version: 1,
    };
  }

  restore(snapshot: SimulationClockSnapshot) {
    if (snapshot.version !== 1) {
      throw new SimulationContractError(
        `Unsupported simulation clock snapshot version: ${String(snapshot.version)}.`,
      );
    }
    this.baselineMs = parseTimestamp(snapshot.baselineAt, 'clock baseline');
    this.currentMs = parseTimestamp(snapshot.currentAt, 'clock current time');
  }
}

function parseTimestamp(value: string, label: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new SimulationContractError(
      `The ${label} must be a valid ISO-compatible timestamp.`,
    );
  }
  return timestamp;
}
