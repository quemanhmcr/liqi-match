import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MediaLocalAssetSchema,
  MediaStagingItemSchema,
} from '@/entities/player-profile';
import * as FileSystem from 'expo-file-system/legacy';

import type {
  ProfileEditMediaSlot,
  ProfileEditStagedMedia,
} from './profile-edit-model';

const pendingSlotKey = 'profile-edit:pending-media-slot:v1';
const mediaDraftKeyPrefix = 'profile-edit:staged-media:v1:';
const mediaDirectoryName = 'profile-edit-media';

type StoredProfileMediaDraft = {
  slots: Partial<Record<ProfileEditMediaSlot, ProfileEditStagedMedia>>;
  version: 2;
};

export async function rememberPendingProfileMediaSlot(
  slot: ProfileEditMediaSlot,
) {
  await AsyncStorage.setItem(pendingSlotKey, slot);
}

export async function consumePendingProfileMediaSlot() {
  const value = await AsyncStorage.getItem(pendingSlotKey);
  await AsyncStorage.removeItem(pendingSlotKey);
  return value === 'avatar' || value === 'cover' ? value : undefined;
}

export async function clearPendingProfileMediaSlot() {
  await AsyncStorage.removeItem(pendingSlotKey);
}

/**
 * Copies picker output out of temporary cache before recording the canonical
 * durable item. Uploaded items retain their asset id so association can resume
 * after restart without uploading bytes again.
 */
export async function persistProfileMediaDraftItem(
  profileId: string,
  item: ProfileEditStagedMedia,
): Promise<ProfileEditStagedMedia> {
  const current = await readStoredDraft(profileId);
  const previous = current.slots[item.slot];
  const durable = await ensureDurableLocalFile(profileId, item);
  const canonical = parseProfileItem({
    ...durable,
    persistedAt: new Date().toISOString(),
  });

  if (previous?.asset.uri !== canonical.asset.uri) {
    await deleteManagedFile(previous?.asset.uri);
  }

  current.slots[canonical.slot] = canonical;
  await writeStoredDraft(profileId, current);
  return canonical;
}

export async function restoreProfileMediaDraft(profileId: string) {
  const stored = await readStoredDraft(profileId);
  const restored: Partial<
    Record<ProfileEditMediaSlot, ProfileEditStagedMedia>
  > = {};
  let changed = false;

  for (const slot of ['avatar', 'cover'] as const) {
    const item = stored.slots[slot];
    if (!item) continue;
    if (item.uploadedAssetId !== null) {
      restored[slot] = item;
      continue;
    }

    const info = await FileSystem.getInfoAsync(item.asset.uri).catch(() => ({
      exists: false,
    }));
    if (info.exists) {
      restored[slot] = item;
    } else {
      changed = true;
    }
  }

  if (changed) {
    await writeStoredDraft(profileId, { slots: restored, version: 2 });
  }
  return restored;
}

export async function clearProfileMediaDraftItem(
  profileId: string,
  slot: ProfileEditMediaSlot,
) {
  const stored = await readStoredDraft(profileId);
  const item = stored.slots[slot];
  if (!item) return;

  const requestedAt = item.cleanup.requestedAt ?? new Date().toISOString();
  const lastAttemptAt = new Date().toISOString();
  stored.slots[slot] = parseProfileItem({
    ...item,
    cleanup: {
      completedAt: null,
      failure: null,
      lastAttemptAt,
      requestedAt,
    },
  });
  await writeStoredDraft(profileId, stored);

  try {
    await deleteManagedFile(item.asset.uri, true);
    delete stored.slots[slot];
    await writeStoredDraft(profileId, stored);
  } catch (error) {
    stored.slots[slot] = parseProfileItem({
      ...stored.slots[slot]!,
      cleanup: {
        completedAt: null,
        failure: {
          code: 'local_cleanup_failed',
          message: errorMessage(error),
        },
        lastAttemptAt,
        requestedAt,
      },
    });
    await writeStoredDraft(profileId, stored);
    throw error;
  }
}

export async function clearProfileMediaDraft(profileId: string) {
  const stored = await readStoredDraft(profileId);
  for (const slot of ['avatar', 'cover'] as const) {
    if (!stored.slots[slot]) continue;
    await clearProfileMediaDraftItem(profileId, slot);
  }
}

async function ensureDurableLocalFile(
  profileId: string,
  item: ProfileEditStagedMedia,
): Promise<ProfileEditStagedMedia> {
  if (isManagedFile(item.asset.uri)) return item;
  const directory = mediaDirectory();
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${safeName(profileId)}-${item.slot}-${safeName(
    item.localId,
  )}.${fileExtension(item)}`;
  await FileSystem.deleteAsync(destination, { idempotent: true });
  await FileSystem.copyAsync({ from: item.asset.uri, to: destination });
  return parseProfileItem({
    ...item,
    asset: {
      ...item.asset,
      fileName: item.asset.fileName ?? destination.split('/').pop() ?? null,
      uri: destination,
    },
  });
}

async function readStoredDraft(
  profileId: string,
): Promise<StoredProfileMediaDraft> {
  const key = mediaDraftKey(profileId);
  const value = await AsyncStorage.getItem(key);
  if (!value) return emptyStoredDraft();

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const rawSlots = isRecord(parsed.slots) ? parsed.slots : {};
    const slots: StoredProfileMediaDraft['slots'] = {};
    let changed = parsed.version !== 2;

    for (const slot of ['avatar', 'cover'] as const) {
      const raw = rawSlots[slot];
      if (!raw) continue;
      const migrated = migrateStoredItem(raw, slot);
      if (!migrated) {
        changed = true;
        continue;
      }
      slots[slot] = migrated.item;
      changed ||= migrated.changed;
    }

    const canonical = { slots, version: 2 } satisfies StoredProfileMediaDraft;
    if (changed) await writeStoredDraft(profileId, canonical);
    return canonical;
  } catch {
    await AsyncStorage.removeItem(key);
    return emptyStoredDraft();
  }
}

function migrateStoredItem(
  value: unknown,
  expectedSlot: ProfileEditMediaSlot,
): { changed: boolean; item: ProfileEditStagedMedia } | undefined {
  const canonical = MediaStagingItemSchema.safeParse(value);
  if (canonical.success && canonical.data.slot === expectedSlot) {
    return {
      changed: false,
      item: canonical.data as ProfileEditStagedMedia,
    };
  }
  if (!isRecord(value) || !isRecord(value.asset)) return undefined;

  const asset = MediaLocalAssetSchema.safeParse({
    fileName: nullableString(value.asset.fileName),
    fileSize: nullableNumber(value.asset.fileSize),
    height: nullableNumber(value.asset.height),
    mimeType: nullableString(value.asset.mimeType),
    uri: typeof value.asset.uri === 'string' ? value.asset.uri : '',
    width: nullableNumber(value.asset.width),
  });
  if (!asset.success) return undefined;

  const legacyStatus =
    typeof value.status === 'string' ? value.status : 'ready';
  const status = mapLegacyStatus(legacyStatus);
  const persistedAt = isoDateOrNull(value.persistedAt);
  const attempted =
    status === 'uploading' ||
    status === 'uploaded' ||
    status === 'associated' ||
    status === 'failed';
  const failureMessage =
    typeof value.error === 'string' && value.error.trim()
      ? value.error.trim()
      : status === 'failed'
        ? 'Media operation failed before the staging contract migration.'
        : null;
  const uploadedAssetId = nonEmptyString(value.uploadedAssetId);
  const migrated = MediaStagingItemSchema.safeParse({
    asset: asset.data,
    cleanup: emptyCleanup(),
    failure:
      status === 'failed'
        ? { code: 'legacy_media_failure', message: failureMessage! }
        : null,
    localId:
      nonEmptyString(value.localId) ??
      legacyLocalId(expectedSlot, asset.data.uri),
    persistedAt,
    position: 0,
    retry: {
      attemptCount: attempted ? 1 : 0,
      lastAttemptAt: attempted
        ? (persistedAt ?? new Date().toISOString())
        : null,
      retryable: true,
    },
    slot: expectedSlot,
    status:
      (status === 'uploaded' || status === 'associated') && !uploadedAssetId
        ? 'failed'
        : status,
    uploadedAssetId,
    uploadedObjectKey: nonEmptyString(value.uploadedObjectKey),
  });
  if (!migrated.success) return undefined;
  return { changed: true, item: migrated.data as ProfileEditStagedMedia };
}

async function writeStoredDraft(
  profileId: string,
  draft: StoredProfileMediaDraft,
) {
  const key = mediaDraftKey(profileId);
  if (!Object.keys(draft.slots).length) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, JSON.stringify(draft));
}

async function deleteManagedFile(uri: string | undefined, strict = false) {
  if (!uri || !isManagedFile(uri)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    if (strict) throw error;
  }
}

function parseProfileItem(value: unknown): ProfileEditStagedMedia {
  const parsed = MediaStagingItemSchema.parse(value);
  if (parsed.slot !== 'avatar' && parsed.slot !== 'cover') {
    throw new Error('Profile Edit chỉ hỗ trợ avatar hoặc cover media.');
  }
  return parsed as ProfileEditStagedMedia;
}

function mediaDraftKey(profileId: string) {
  return `${mediaDraftKeyPrefix}${profileId}`;
}

function mediaDirectory() {
  if (!FileSystem.documentDirectory) {
    throw new Error('Không có thư mục bền vững để giữ ảnh đã chọn.');
  }
  return `${FileSystem.documentDirectory}${mediaDirectoryName}/`;
}

function isManagedFile(uri: string) {
  return (
    Boolean(FileSystem.documentDirectory) && uri.startsWith(mediaDirectory())
  );
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function fileExtension(item: ProfileEditStagedMedia) {
  const mimeType = item.asset.mimeType?.toLowerCase();
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  const candidate = (item.asset.fileName ?? item.asset.uri)
    .split('?')[0]
    ?.split('.')
    .pop()
    ?.toLowerCase();
  return candidate === 'png' || candidate === 'webp' ? candidate : 'jpg';
}

function mapLegacyStatus(value: string) {
  if (value === 'selected') return 'selected' as const;
  if (value === 'uploading') return 'uploading' as const;
  if (value === 'uploaded-unassociated' || value === 'uploaded') {
    return 'uploaded' as const;
  }
  if (value === 'associated') return 'associated' as const;
  if (value === 'failed' || value === 'error') return 'failed' as const;
  return 'ready' as const;
}

function legacyLocalId(slot: ProfileEditMediaSlot, uri: string) {
  let hash = 0;
  for (const character of uri) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `${slot}:0:legacy-${hash.toString(36)}`;
}

function emptyStoredDraft(): StoredProfileMediaDraft {
  return { slots: {}, version: 2 };
}

function emptyCleanup() {
  return {
    completedAt: null,
    failure: null,
    lastAttemptAt: null,
    requestedAt: null,
  } as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown) {
  return value === null || typeof value === 'string' ? value : null;
}

function nullableNumber(value: unknown) {
  return value === null || typeof value === 'number' ? value : null;
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isoDateOrNull(value: unknown) {
  if (typeof value !== 'string') return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'Không thể dọn file media cục bộ.';
}
