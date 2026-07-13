export type OnboardingMediaSlot = 'avatar' | 'cover' | 'wall';
export type OnboardingMediaStatus =
  'selected' | 'uploading' | 'uploaded' | 'associated' | 'error';

export type OnboardingMediaQueueItem = {
  error?: string;
  fileName?: string | null;
  fileSize?: number | null;
  height?: number | null;
  localId: string;
  localUri: string;
  mimeType?: string | null;
  position: number;
  slot: OnboardingMediaSlot;
  status: OnboardingMediaStatus;
  uploadedAssetId?: string;
  uploadedObjectKey?: string;
  width?: number | null;
};

export type PendingMediaSelection = {
  position: number;
  slot: OnboardingMediaSlot;
};

export function isOnboardingMediaItem(
  value: unknown,
): value is OnboardingMediaQueueItem {
  if (!isRecord(value)) return false;
  return Boolean(
    mediaSlot(value.slot) &&
    mediaStatus(value.status) &&
    typeof value.localId === 'string' &&
    typeof value.localUri === 'string' &&
    typeof value.position === 'number',
  );
}

export function sanitizeOnboardingMediaItem(
  value: unknown,
): OnboardingMediaQueueItem | undefined {
  if (!isOnboardingMediaItem(value)) return undefined;

  return {
    error: optionalString(value.error),
    fileName: optionalNullableString(value.fileName),
    fileSize: optionalNullableNumber(value.fileSize),
    height: optionalNullableNumber(value.height),
    localId: value.localId,
    localUri: value.localUri,
    mimeType: optionalNullableString(value.mimeType),
    position: value.position,
    slot: mediaSlot(value.slot)!,
    status: mediaStatus(value.status)!,
    uploadedAssetId: optionalString(value.uploadedAssetId),
    uploadedObjectKey: optionalString(value.uploadedObjectKey),
    width: optionalNullableNumber(value.width),
  };
}

export function isPendingMediaSelection(
  value: unknown,
): value is PendingMediaSelection {
  return (
    isRecord(value) &&
    Boolean(mediaSlot(value.slot)) &&
    typeof value.position === 'number'
  );
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

function mediaSlot(value: unknown): OnboardingMediaSlot | undefined {
  if (value === 'avatar' || value === 'cover' || value === 'wall') return value;
  return undefined;
}

function mediaStatus(value: unknown): OnboardingMediaStatus | undefined {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function optionalNullableString(value: unknown) {
  return value === null || typeof value === 'string' ? value : undefined;
}

function optionalNullableNumber(value: unknown) {
  return value === null || typeof value === 'number' ? value : undefined;
}
