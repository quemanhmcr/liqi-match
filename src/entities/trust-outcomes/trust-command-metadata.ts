import {
  CorrelationIdSchema,
  IdempotencyKeySchema,
} from '@/shared/contracts/core-v1';
import { z } from 'zod';
import type {
  CoreV2CreateCommandMetadataSchema,
  CoreV2MutationCommandMetadataSchema,
} from '@/shared/contracts/core-v2';

type MutationMetadata = z.infer<typeof CoreV2MutationCommandMetadataSchema>;
type CreateMetadata = z.infer<typeof CoreV2CreateCommandMetadataSchema>;

export type TrustCommandMetadataDependencies = Readonly<{
  appVersion?: string;
  createUuid?: () => string;
  now?: () => Date;
  platform?: 'android' | 'ios' | 'web';
}>;

export function createTrustMutationMetadata(
  expectedVersion: number,
  operation: string,
  dependencies: TrustCommandMetadataDependencies = {},
): MutationMetadata {
  return createMetadata(
    expectedVersion,
    operation,
    dependencies,
  ) as MutationMetadata;
}

export function createTrustCreateMetadata(
  operation: string,
  dependencies: TrustCommandMetadataDependencies = {},
): CreateMetadata {
  return createMetadata(0, operation, dependencies) as CreateMetadata;
}

export function createTrustMutationMetadataForSource(
  expectedVersion: number,
  operation: string,
  sourceId: string,
  qualifiers: readonly string[] = [],
  dependencies: Omit<TrustCommandMetadataDependencies, 'createUuid'> = {},
): MutationMetadata {
  return createSourceMetadata(
    expectedVersion,
    operation,
    sourceId,
    qualifiers,
    dependencies,
  ) as MutationMetadata;
}

export function createTrustCreateMetadataForSource(
  operation: string,
  sourceId: string,
  qualifiers: readonly string[] = [],
  dependencies: Omit<TrustCommandMetadataDependencies, 'createUuid'> = {},
): CreateMetadata {
  return {
    ...createSourceMetadata(0, operation, sourceId, qualifiers, dependencies),
    expectedVersion: 0 as const,
  } as CreateMetadata;
}

function createSourceMetadata(
  expectedVersion: number,
  operation: string,
  sourceId: string,
  qualifiers: readonly string[],
  dependencies: Omit<TrustCommandMetadataDependencies, 'createUuid'>,
) {
  const canonicalSourceId = z.string().uuid().parse(sourceId);
  const timestamp = (dependencies.now ?? (() => new Date()))().toISOString();
  return {
    audit: {
      appVersion: dependencies.appVersion ?? runtimeAppVersion(),
      clientCreatedAt: timestamp,
      clientRequestId: canonicalSourceId,
      platform: dependencies.platform ?? runtimePlatform(),
    },
    correlationId: CorrelationIdSchema.parse(canonicalSourceId),
    expectedVersion,
    idempotencyKey: IdempotencyKeySchema.parse(
      ['trust', operation, canonicalSourceId, ...qualifiers].join(':'),
    ),
  };
}

function createMetadata(
  expectedVersion: number,
  operation: string,
  dependencies: TrustCommandMetadataDependencies,
) {
  const createUuid = dependencies.createUuid ?? runtimeUuid;
  const uuid = createUuid();
  const timestamp = (dependencies.now ?? (() => new Date()))().toISOString();
  const correlationId = CorrelationIdSchema.parse(createUuid());
  return {
    audit: {
      appVersion: dependencies.appVersion ?? runtimeAppVersion(),
      clientCreatedAt: timestamp,
      clientRequestId: uuid,
      platform: dependencies.platform ?? runtimePlatform(),
    },
    correlationId,
    expectedVersion,
    idempotencyKey: IdempotencyKeySchema.parse(`trust:${operation}:${uuid}`),
  };
}

function runtimeUuid() {
  // Lazy require keeps unit tests deterministic and follows the established Expo runtime seam.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('expo-crypto') as typeof import('expo-crypto');
  return crypto.randomUUID();
}

/* eslint-disable @typescript-eslint/no-require-imports */
function runtimeAppVersion() {
  try {
    const ExpoConstants =
      require('expo-constants') as typeof import('expo-constants');
    return ExpoConstants.default.expoConfig?.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function runtimePlatform(): 'android' | 'ios' | 'web' {
  try {
    const ReactNative =
      require('react-native') as typeof import('react-native');
    const platform = ReactNative.Platform.OS;
    return platform === 'android' || platform === 'ios' || platform === 'web'
      ? platform
      : 'web';
  } catch {
    return 'web';
  }
}
/* eslint-enable @typescript-eslint/no-require-imports */
