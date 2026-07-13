import { z } from 'zod';

import { PROFILE_LIMITS } from './catalogs';

const IsoDateTimeSchema = z.string().datetime({ offset: true });
const OptionalNonEmptyStringSchema = z.string().trim().min(1).nullable();

export const MediaStagingSlotSchema = z.enum(['avatar', 'cover', 'wall']);

/**
 * Neutral upload lifecycle shared by onboarding and Profile Edit.
 *
 * `uploaded` means the bytes have been accepted by the media backend but the
 * required profile association may still be pending. Feature orchestration is
 * responsible for advancing an item to `associated`.
 */
export const MediaStagingStatusSchema = z.enum([
  'selected',
  'ready',
  'uploading',
  'uploaded',
  'associated',
  'failed',
]);

export const MediaStagingTargetSchema = z
  .object({
    position: z.number().int().min(0),
    slot: MediaStagingSlotSchema,
  })
  .strict()
  .superRefine((target, context) => {
    if (target.slot === 'wall') {
      if (target.position >= PROFILE_LIMITS.wallMedia) {
        context.addIssue({
          code: 'custom',
          message: 'Wall media position exceeds the canonical profile limit.',
          path: ['position'],
        });
      }
      return;
    }

    if (target.position !== 0) {
      context.addIssue({
        code: 'custom',
        message: 'Avatar and cover media must use position zero.',
        path: ['position'],
      });
    }
  });

export const MediaLocalAssetSchema = z
  .object({
    fileName: z.string().trim().min(1).nullable(),
    fileSize: z.number().int().nonnegative().nullable(),
    height: z.number().int().positive().nullable(),
    mimeType: z.string().trim().min(1).nullable(),
    uri: z.string().trim().min(1),
    width: z.number().int().positive().nullable(),
  })
  .strict();

export const MediaStagingFailureSchema = z
  .object({
    code: OptionalNonEmptyStringSchema,
    message: z.string().trim().min(1),
  })
  .strict();

export const MediaStagingRetryMetadataSchema = z
  .object({
    attemptCount: z.number().int().nonnegative(),
    lastAttemptAt: IsoDateTimeSchema.nullable(),
    retryable: z.boolean(),
  })
  .strict()
  .superRefine((retry, context) => {
    if (retry.attemptCount === 0 && retry.lastAttemptAt !== null) {
      context.addIssue({
        code: 'custom',
        message: 'A media item with no attempts cannot have a last attempt.',
        path: ['lastAttemptAt'],
      });
    }
    if (retry.attemptCount > 0 && retry.lastAttemptAt === null) {
      context.addIssue({
        code: 'custom',
        message: 'Attempted media must record its last attempt timestamp.',
        path: ['lastAttemptAt'],
      });
    }
  });

/**
 * Records cleanup progress without prescribing storage, file deletion, object
 * deletion, or command orchestration. Null `requestedAt` means no cleanup has
 * been requested for the durable item.
 */
export const MediaStagingCleanupMetadataSchema = z
  .object({
    completedAt: IsoDateTimeSchema.nullable(),
    failure: MediaStagingFailureSchema.nullable(),
    lastAttemptAt: IsoDateTimeSchema.nullable(),
    requestedAt: IsoDateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((cleanup, context) => {
    if (cleanup.requestedAt !== null) return;

    if (cleanup.completedAt !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Cleanup cannot complete before it is requested.',
        path: ['completedAt'],
      });
    }
    if (cleanup.lastAttemptAt !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Cleanup cannot be attempted before it is requested.',
        path: ['lastAttemptAt'],
      });
    }
    if (cleanup.failure !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Cleanup cannot fail before it is requested.',
        path: ['failure'],
      });
    }
  });

export const MediaStagingItemSchema = z
  .object({
    asset: MediaLocalAssetSchema,
    cleanup: MediaStagingCleanupMetadataSchema,
    failure: MediaStagingFailureSchema.nullable(),
    localId: z.string().trim().min(1),
    persistedAt: IsoDateTimeSchema.nullable(),
    position: z.number().int().min(0),
    retry: MediaStagingRetryMetadataSchema,
    slot: MediaStagingSlotSchema,
    status: MediaStagingStatusSchema,
    uploadedAssetId: OptionalNonEmptyStringSchema,
    uploadedObjectKey: OptionalNonEmptyStringSchema,
  })
  .strict()
  .superRefine((item, context) => {
    const targetResult = MediaStagingTargetSchema.safeParse({
      position: item.position,
      slot: item.slot,
    });
    if (!targetResult.success) {
      for (const issue of targetResult.error.issues) {
        context.addIssue({
          code: 'custom',
          message: issue.message,
          path: issue.path,
        });
      }
    }

    if (
      (item.status === 'uploaded' || item.status === 'associated') &&
      item.uploadedAssetId === null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Uploaded or associated media requires an uploaded asset ID.',
        path: ['uploadedAssetId'],
      });
    }

    if (item.status === 'failed' && item.failure === null) {
      context.addIssue({
        code: 'custom',
        message: 'Failed media must include a structured failure.',
        path: ['failure'],
      });
    }

    if (item.status !== 'failed' && item.failure !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Only failed media may carry a current failure.',
        path: ['failure'],
      });
    }
  });

export const MediaStagingQueueSchema = z
  .array(MediaStagingItemSchema)
  .max(PROFILE_LIMITS.wallMedia + 2)
  .superRefine((items, context) => {
    const localIds = new Set<string>();
    const targets = new Set<string>();

    items.forEach((item, index) => {
      if (localIds.has(item.localId)) {
        context.addIssue({
          code: 'custom',
          message: 'Media staging local IDs must be unique.',
          path: [index, 'localId'],
        });
      }
      localIds.add(item.localId);

      const target = `${item.slot}:${item.position}`;
      if (targets.has(target)) {
        context.addIssue({
          code: 'custom',
          message: 'Only one staged media item may occupy a slot position.',
          path: [index, 'position'],
        });
      }
      targets.add(target);
    });
  });

export type MediaStagingSlot = z.infer<typeof MediaStagingSlotSchema>;
export type MediaStagingStatus = z.infer<typeof MediaStagingStatusSchema>;
export type MediaStagingTarget = z.infer<typeof MediaStagingTargetSchema>;
export type MediaLocalAsset = z.infer<typeof MediaLocalAssetSchema>;
export type MediaStagingFailure = z.infer<typeof MediaStagingFailureSchema>;
export type MediaStagingRetryMetadata = z.infer<
  typeof MediaStagingRetryMetadataSchema
>;
export type MediaStagingCleanupMetadata = z.infer<
  typeof MediaStagingCleanupMetadataSchema
>;
export type MediaStagingItem = z.infer<typeof MediaStagingItemSchema>;
export type MediaStagingQueue = z.infer<typeof MediaStagingQueueSchema>;
