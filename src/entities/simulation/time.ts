import { offsetSimulationTimestamp } from '@/shared/simulation';

/** Pure deterministic ISO arithmetic shared by datasets and mutation tests. */
export function simulationIsoAtOffset(anchor: string, offsetMs: number) {
  return offsetSimulationTimestamp(anchor, offsetMs);
}

export function simulationIsoMinutesBefore(anchor: string, minutes: number) {
  return simulationIsoAtOffset(anchor, -minutes * 60_000);
}

export function simulationIsoMinutesAfter(anchor: string, minutes: number) {
  return simulationIsoAtOffset(anchor, minutes * 60_000);
}
