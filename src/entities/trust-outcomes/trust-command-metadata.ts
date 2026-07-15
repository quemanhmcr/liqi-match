import {
  CorrelationIdSchema,
  IdempotencyKeySchema,
} from '@/shared/contracts/core-v1';
import type {
  CoreV2CreateCommandMetadataSchema,
  CoreV2MutationCommandMetadataSchema,
} from '@/shared/contracts/core-v2';
import type { z } from 'zod';

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
