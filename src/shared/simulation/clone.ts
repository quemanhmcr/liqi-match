import type { SimulationJsonValue } from './contracts';
import { SimulationContractError } from './errors';

/**
 * Snapshot data is deliberately JSON-shaped. Rejecting Dates, undefined and
 * class instances prevents platform-specific restore behavior and accidental
 * sharing of mutable references between scenarios or tests.
 */
export function cloneSimulationState<T>(value: T): T {
  return cloneValue(value, '$', new Set<object>()) as T;
}

export function assertSimulationJsonValue(
  value: unknown,
): asserts value is SimulationJsonValue {
  cloneValue(value, '$', new Set<object>());
}

function cloneValue(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): SimulationJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new SimulationContractError(
        `Simulation state at ${path} must contain only finite numbers.`,
      );
    }
    return value;
  }

  if (Array.isArray(value)) {
    assertNotCircular(value, path, ancestors);
    ancestors.add(value);
    const result = value.map((item, index) =>
      cloneValue(item, `${path}[${index}]`, ancestors),
    );
    ancestors.delete(value);
    return result;
  }

  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new SimulationContractError(
        `Simulation state at ${path} must use plain objects and ISO strings, not ${prototype?.constructor?.name ?? 'a class instance'}.`,
      );
    }

    assertNotCircular(value, path, ancestors);
    ancestors.add(value);
    const result: Record<string, SimulationJsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = cloneValue(child, `${path}.${key}`, ancestors);
    }
    ancestors.delete(value);
    return result;
  }

  throw new SimulationContractError(
    `Simulation state at ${path} contains unsupported ${typeof value}.`,
  );
}

function assertNotCircular(
  value: object,
  path: string,
  ancestors: Set<object>,
) {
  if (ancestors.has(value)) {
    throw new SimulationContractError(
      `Simulation state at ${path} contains a circular reference.`,
    );
  }
}
