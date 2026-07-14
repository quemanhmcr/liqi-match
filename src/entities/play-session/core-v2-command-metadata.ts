import { Platform } from 'react-native';

import {
  CorrelationIdSchema,
  IdempotencyKeySchema,
  type CorrelationId,
  type IdempotencyKey,
} from '@/shared/contracts/core-v1';
import type { CoreV2CommandAuditMetadata } from '@/shared/contracts/core-v2';

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
  now = new Date(),
): PreparedCoreV2CommandMetadata<TVersion> {
  const platform =
    Platform.OS === 'ios' || Platform.OS === 'web' ? Platform.OS : 'android';
  return {
    audit: {
      appVersion: 'core-v2',
      clientCreatedAt: now.toISOString(),
      clientRequestId: createRuntimeUuid(),
      deviceInstallationId: createRuntimeUuid(),
      platform,
    },
    correlationId: CorrelationIdSchema.parse(createRuntimeUuid()),
    expectedVersion,
    idempotencyKey: IdempotencyKeySchema.parse(
      `session.${createRuntimeUuid()}`,
    ),
  };
}
