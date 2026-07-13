import type { SimulationWorldValidationContext } from '@/shared/simulation';

import type { SimulationWorldSnapshot } from './world-schema';

export class SimulationMutationIntegrityError extends Error {
  constructor(
    readonly path: string,
    readonly operation: string,
  ) {
    super(`Simulation mutation ${operation} changed immutable field ${path}.`);
    this.name = 'SimulationMutationIntegrityError';
  }
}

/**
 * Guards the immutable identity surface declared by the canonical world owner.
 * Referential and business invariants remain enforced by assertSimulationWorldIntegrity.
 */
export function assertSimulationMutationIntegrity(
  previous: Readonly<SimulationWorldSnapshot>,
  next: Readonly<SimulationWorldSnapshot>,
  context: SimulationWorldValidationContext,
) {
  assertEqual(previous.version, next.version, 'world.version', context);
  assertEqual(
    previous.scenarioId,
    next.scenarioId,
    'world.scenarioId',
    context,
  );
  assertEqual(previous.viewerId, next.viewerId, 'world.viewerId', context);

  assertExistingRecords(previous.profiles, next.profiles, 'profiles', context, [
    'id',
    'identityKey',
    'createdAt',
  ]);
  assertExistingRecords(previous.sets, next.sets, 'sets', context, [
    'id',
    'createdAt',
  ]);
  assertExistingRecords(previous.matches, next.matches, 'matches', context, [
    'id',
    'createdAt',
  ]);
  assertExistingRecords(
    previous.conversations,
    next.conversations,
    'conversations',
    context,
    ['id', 'createdAt'],
  );
  assertExistingRecords(previous.messages, next.messages, 'messages', context, [
    'id',
    'createdAt',
  ]);
  assertExistingRecords(
    previous.notifications,
    next.notifications,
    'notifications',
    context,
    ['id', 'occurredAt'],
  );
  assertExistingRecords(previous.assets, next.assets, 'assets', context, [
    'key',
    'kind',
  ]);
}

function assertExistingRecords<
  RecordValue extends Record<string, unknown>,
  Key extends keyof RecordValue,
>(
  previous: Readonly<Record<string, RecordValue>>,
  next: Readonly<Record<string, RecordValue>>,
  table: string,
  context: SimulationWorldValidationContext,
  keys: readonly Key[],
) {
  for (const [recordKey, previousValue] of Object.entries(previous)) {
    const nextValue = next[recordKey];
    if (!nextValue) {
      throw new SimulationMutationIntegrityError(
        `${table}.${recordKey}`,
        context.operation,
      );
    }
    for (const key of keys) {
      assertEqual(
        previousValue[key],
        nextValue[key],
        `${table}.${recordKey}.${String(key)}`,
        context,
      );
    }
  }
}

function assertEqual(
  previous: unknown,
  next: unknown,
  path: string,
  context: SimulationWorldValidationContext,
) {
  if (previous === next) return;
  throw new SimulationMutationIntegrityError(path, context.operation);
}
