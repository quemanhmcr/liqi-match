import {
  MediaStagingItemSchema,
  MediaStagingQueueSchema,
  MediaStagingTargetSchema,
  type MediaLocalAsset,
  type MediaStagingItem,
  type MediaStagingSlot,
  type MediaStagingStatus,
  type MediaStagingTarget,
} from '@/entities/player-profile';

export type OnboardingMediaQueueItem = MediaStagingItem;
export type OnboardingMediaSlot = MediaStagingSlot;
export type OnboardingMediaStatus = MediaStagingStatus;
export type PendingMediaSelection = MediaStagingTarget;

export function createOnboardingMediaQueueItem(input: {
  asset: {
    fileName?: string | null;
    fileSize?: number | null;
    height?: number | null;
    mimeType?: string | null;
    uri: string;
    width?: number | null;
  };
  localId: string;
  persistedAt?: string | null;
  position: number;
  slot: OnboardingMediaSlot;
  status?: 'ready' | 'selected';
}): OnboardingMediaQueueItem {
  return MediaStagingItemSchema.parse({
    asset: normalizeLocalAsset(input.asset),
    cleanup: emptyCleanupMetadata(),
    failure: null,
    localId: input.localId,
    persistedAt: input.persistedAt ?? new Date().toISOString(),
    position: input.position,
    retry: emptyRetryMetadata(),
    slot: input.slot,
    status: input.status ?? 'selected',
    uploadedAssetId: null,
    uploadedObjectKey: null,
  });
}

export function isOnboardingMediaItem(
  value: unknown,
): value is OnboardingMediaQueueItem {
  return MediaStagingItemSchema.safeParse(value).success;
}

export function sanitizeOnboardingMediaItem(
  value: unknown,
): OnboardingMediaQueueItem | undefined {
  const result = MediaStagingItemSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function sanitizeOnboardingMediaQueue(
  value: unknown,
): OnboardingMediaQueueItem[] {
  const result = MediaStagingQueueSchema.safeParse(value);
  return result.success ? result.data : [];
}

export function migrateLegacyOnboardingMediaQueue(
  value: unknown,
  fallbackTimestamp: string,
): OnboardingMediaQueueItem[] {
  if (!Array.isArray(value)) return [];
  const migrated = value
    .map((item) => migrateLegacyOnboardingMediaItem(item, fallbackTimestamp))
    .filter((item): item is OnboardingMediaQueueItem => Boolean(item));
  const parsed = MediaStagingQueueSchema.safeParse(migrated);
  return parsed.success ? parsed.data : [];
}

export function isPendingMediaSelection(
  value: unknown,
): value is PendingMediaSelection {
  return MediaStagingTargetSchema.safeParse(value).success;
}

export function sortOnboardingMediaQueue(items: OnboardingMediaQueueItem[]) {
  const slotOrder: Record<OnboardingMediaSlot, number> = {
    avatar: 0,
    cover: 1,
    wall: 2,
  };
  return [...items].sort(
    (left, right) =>
      slotOrder[left.slot] - slotOrder[right.slot] ||
      left.position - right.position,
  );
}

function migrateLegacyOnboardingMediaItem(
  value: unknown,
  fallbackTimestamp: string,
): OnboardingMediaQueueItem | undefined {
  const current = sanitizeOnboardingMediaItem(value);
  if (current) return current;
  if (!isRecord(value)) return undefined;

  const target = MediaStagingTargetSchema.safeParse({
    position: value.position,
    slot: value.slot,
  });
  if (
    !target.success ||
    typeof value.localId !== 'string' ||
    !value.localId.trim() ||
    typeof value.localUri !== 'string' ||
    !value.localUri.trim()
  ) {
    return undefined;
  }

  const timestamp = validIsoTimestamp(fallbackTimestamp);
  const uploadedAssetId = optionalNonEmptyString(value.uploadedAssetId);
  const uploadedObjectKey = optionalNonEmptyString(value.uploadedObjectKey);
  const legacyStatus = legacyMediaStatus(value.status);
  if (!legacyStatus) return undefined;

  let status: OnboardingMediaStatus =
    legacyStatus === 'error' ? 'failed' : legacyStatus;
  let failure =
    legacyStatus === 'error'
      ? {
          code: 'legacy_media_error',
          message:
            optionalNonEmptyString(value.error) ??
            'Ảnh cũ cần được thử lại trước khi hoàn tất.',
        }
      : null;

  if (
    (status === 'uploaded' || status === 'associated') &&
    uploadedAssetId === null
  ) {
    status = 'failed';
    failure = {
      code: 'missing_uploaded_asset_id',
      message: 'Ảnh cũ thiếu định danh asset đã upload và cần được chọn lại.',
    };
  }

  const parsed = MediaStagingItemSchema.safeParse({
    asset: normalizeLocalAsset({
      fileName: optionalNullableString(value.fileName),
      fileSize: optionalNullableNumber(value.fileSize),
      height: optionalNullableNumber(value.height),
      mimeType: optionalNullableString(value.mimeType),
      uri: value.localUri,
      width: optionalNullableNumber(value.width),
    }),
    cleanup: emptyCleanupMetadata(),
    failure,
    localId: value.localId,
    persistedAt: timestamp,
    position: target.data.position,
    retry: emptyRetryMetadata(),
    slot: target.data.slot,
    status,
    uploadedAssetId,
    uploadedObjectKey,
  });
  return parsed.success ? parsed.data : undefined;
}

function normalizeLocalAsset(input: {
  fileName?: string | null;
  fileSize?: number | null;
  height?: number | null;
  mimeType?: string | null;
  uri: string;
  width?: number | null;
}): MediaLocalAsset {
  return {
    fileName: input.fileName ?? null,
    fileSize: input.fileSize ?? null,
    height: input.height ?? null,
    mimeType: input.mimeType ?? null,
    uri: input.uri,
    width: input.width ?? null,
  };
}

function emptyRetryMetadata() {
  return {
    attemptCount: 0,
    lastAttemptAt: null,
    retryable: true,
  } as const;
}

function emptyCleanupMetadata() {
  return {
    completedAt: null,
    failure: null,
    lastAttemptAt: null,
    requestedAt: null,
  } as const;
}

function legacyMediaStatus(value: unknown) {
  if (
    value === 'selected' ||
    value === 'uploading' ||
    value === 'uploaded' ||
    value === 'associated' ||
    value === 'error'
  ) {
    return value;
  }
  return undefined;
}

function validIsoTimestamp(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalNullableString(value: unknown) {
  return value === null || typeof value === 'string' ? value : null;
}

function optionalNullableNumber(value: unknown) {
  return value === null || typeof value === 'number' ? value : null;
}
