import AsyncStorage from '@react-native-async-storage/async-storage';
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
  version: 1;
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
 * Copies picker output out of the temporary cache before recording the draft.
 * Uploaded-but-unassociated items retain their asset id so association can be
 * retried after an app restart without uploading the bytes again.
 */
export async function persistProfileMediaDraftItem(
  profileId: string,
  item: ProfileEditStagedMedia,
): Promise<ProfileEditStagedMedia> {
  const current = await readStoredDraft(profileId);
  const previous = current.slots[item.slot];
  const durable = await ensureDurableLocalFile(profileId, item);

  if (previous?.asset.uri !== durable.asset.uri) {
    await deleteManagedFile(previous?.asset.uri);
  }

  current.slots[item.slot] = {
    ...durable,
    persistedAt: new Date().toISOString(),
  };
  await writeStoredDraft(profileId, current);
  return current.slots[item.slot] as ProfileEditStagedMedia;
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
    if (item.uploadedAssetId) {
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
    await writeStoredDraft(profileId, { slots: restored, version: 1 });
  }
  return restored;
}

export async function clearProfileMediaDraftItem(
  profileId: string,
  slot: ProfileEditMediaSlot,
) {
  const stored = await readStoredDraft(profileId);
  const item = stored.slots[slot];
  delete stored.slots[slot];
  await deleteManagedFile(item?.asset.uri);
  await writeStoredDraft(profileId, stored);
}

export async function clearProfileMediaDraft(profileId: string) {
  const stored = await readStoredDraft(profileId);
  await Promise.all(
    Object.values(stored.slots).map((item) =>
      deleteManagedFile(item?.asset.uri),
    ),
  );
  await AsyncStorage.removeItem(mediaDraftKey(profileId));
}

async function ensureDurableLocalFile(
  profileId: string,
  item: ProfileEditStagedMedia,
): Promise<ProfileEditStagedMedia> {
  if (isManagedFile(item.asset.uri)) return item;
  const directory = mediaDirectory();
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${safeName(profileId)}-${item.slot}.${fileExtension(item)}`;
  await FileSystem.deleteAsync(destination, { idempotent: true });
  await FileSystem.copyAsync({ from: item.asset.uri, to: destination });
  return {
    ...item,
    asset: {
      ...item.asset,
      fileName: item.asset.fileName ?? destination.split('/').pop(),
      uri: destination,
    },
  };
}

async function readStoredDraft(
  profileId: string,
): Promise<StoredProfileMediaDraft> {
  const key = mediaDraftKey(profileId);
  const value = await AsyncStorage.getItem(key);
  if (!value) return { slots: {}, version: 1 };
  try {
    const parsed = JSON.parse(value) as Partial<StoredProfileMediaDraft>;
    return {
      slots:
        parsed.slots && typeof parsed.slots === 'object' ? parsed.slots : {},
      version: 1,
    };
  } catch {
    await AsyncStorage.removeItem(key);
    return { slots: {}, version: 1 };
  }
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

async function deleteManagedFile(uri: string | undefined) {
  if (!uri || !isManagedFile(uri)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(
    () => undefined,
  );
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
