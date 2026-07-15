import {
  prepareCoreV2CommandMetadata as prepareSharedCoreV2CommandMetadata,
  type PreparedCoreV2CommandMetadata,
} from '@/shared/core-v2';

export type { PreparedCoreV2CommandMetadata };

export function prepareCoreV2CommandMetadata<TVersion extends number>(
  expectedVersion: TVersion,
  now = new Date(),
): PreparedCoreV2CommandMetadata<TVersion> {
  return prepareSharedCoreV2CommandMetadata(expectedVersion, {
    idempotencyScope: 'session',
    now,
  });
}
