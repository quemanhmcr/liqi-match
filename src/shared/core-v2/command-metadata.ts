import {
  CorrelationIdSchema,
  IdempotencyKeySchema,
  type CorrelationId,
  type IdempotencyKey,
} from '@/shared/contracts/core-v1';
import type { CoreV2CommandAuditMetadata } from '@/shared/contracts/core-v2';

import { getRuntimeAuditPlatform } from './runtime-platform';
import { createRuntimeUuid } from './runtime-uuid';

export type PreparedCoreV2CommandMetadata<TVersion extends number = number> =
  Readonly<{
    audit: CoreV2CommandAuditMetadata;
    correlationId: CorrelationId;
    expectedVersion: TVersion;
    idempotencyKey: IdempotencyKey;
  }>;

export function prepareCoreV2CommandMetadata<TVersion extends number>(
  expectedVersion: TVersion,
  options: Readonly<{
    idempotencyScope: string;
    now?: Date;
  }>,
): PreparedCoreV2CommandMetadata<TVersion> {
  const now = options.now ?? new Date();
  const scope = options.idempotencyScope.trim();
  if (!/^[A-Za-z0-9._:-]{1,32}$/.test(scope)) {
    throw new Error('Core V2 idempotency scope is invalid.');
  }
  return {
    audit: {
      appVersion: 'core-v2',
      clientCreatedAt: now.toISOString(),
      clientRequestId: createRuntimeUuid(),
      deviceInstallationId: createRuntimeUuid(),
      platform: getRuntimeAuditPlatform(),
    },
    correlationId: CorrelationIdSchema.parse(createRuntimeUuid()),
    expectedVersion,
    idempotencyKey: IdempotencyKeySchema.parse(
      `${scope}.${createRuntimeUuid()}`,
    ),
  };
}
