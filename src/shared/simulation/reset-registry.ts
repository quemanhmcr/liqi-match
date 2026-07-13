import type {
  SimulationJsonValue,
  SimulationResetContext,
  SimulationResetParticipant,
  SimulationResetPhase,
} from './contracts';
import { cloneSimulationState } from './clone';
import { SimulationContractError } from './errors';

type RegisteredParticipant = {
  participant: SimulationResetParticipant;
  sequence: number;
};

const phaseOrder: Record<SimulationResetPhase, number> = {
  'before-world': 0,
  'after-world': 1,
};

/** Instance-local registry; no feature store is imported by the runtime. */
export class SimulationResetRegistry {
  private readonly participants = new Map<string, RegisteredParticipant>();
  private nextSequence = 0;

  register<TState extends SimulationJsonValue>(
    participant: SimulationResetParticipant<TState>,
  ) {
    const key = participant.key.trim();
    if (!key) {
      throw new SimulationContractError(
        'A simulation reset participant requires a non-empty key.',
      );
    }
    if (this.participants.has(key)) {
      throw new SimulationContractError(
        `Simulation reset participant already registered: ${key}.`,
      );
    }
    if (Boolean(participant.snapshot) !== Boolean(participant.restore)) {
      throw new SimulationContractError(
        `Simulation reset participant ${key} must provide snapshot and restore together.`,
      );
    }

    this.nextSequence += 1;
    this.participants.set(key, {
      participant: { ...participant, key } as SimulationResetParticipant,
      sequence: this.nextSequence,
    });

    return () => {
      this.participants.delete(key);
    };
  }

  async resetPhase(
    phase: SimulationResetPhase,
    context: SimulationResetContext,
  ) {
    for (const { participant } of this.orderedParticipants()) {
      if ((participant.phase ?? 'before-world') !== phase) continue;
      await participant.reset(context);
    }
  }

  async snapshot() {
    const states: Record<string, SimulationJsonValue> = {};
    for (const { participant } of this.orderedParticipants()) {
      if (!participant.snapshot) continue;
      states[participant.key] = cloneSimulationState(
        await participant.snapshot(),
      );
    }
    return states;
  }

  async restorePhase(
    phase: SimulationResetPhase,
    states: Readonly<Record<string, SimulationJsonValue>>,
    context: SimulationResetContext,
  ) {
    for (const { participant } of this.orderedParticipants()) {
      if ((participant.phase ?? 'before-world') !== phase) continue;
      if (!participant.restore) {
        if (phase === 'after-world') await participant.reset(context);
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(states, participant.key)) {
        await participant.reset(context);
        continue;
      }
      await participant.restore(
        cloneSimulationState(states[participant.key]!),
        context,
      );
    }
  }

  list() {
    return this.orderedParticipants().map(({ participant }) => ({
      key: participant.key,
      order: participant.order ?? 0,
      phase: participant.phase ?? ('before-world' as const),
      snapshotCapable: Boolean(participant.snapshot),
    }));
  }

  private orderedParticipants() {
    return [...this.participants.values()].sort((left, right) => {
      const leftPhase = left.participant.phase ?? 'before-world';
      const rightPhase = right.participant.phase ?? 'before-world';
      const phaseDifference = phaseOrder[leftPhase] - phaseOrder[rightPhase];
      if (phaseDifference !== 0) return phaseDifference;

      const orderDifference =
        (left.participant.order ?? 0) - (right.participant.order ?? 0);
      if (orderDifference !== 0) return orderDifference;
      return left.sequence - right.sequence;
    });
  }
}
