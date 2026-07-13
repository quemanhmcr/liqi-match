import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import {
  clearProfileMediaDraftItem,
  persistProfileMediaDraftItem,
  restoreProfileMediaDraft,
} from '@/features/profile/edit/model/profile-media-picker-recovery';
import type { ProfileEditStagedMedia } from '@/features/profile/edit/model/profile-edit-model';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    removeItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));

const mockGetItem = jest.mocked(AsyncStorage.getItem);
const mockRemoveItem = jest.mocked(AsyncStorage.removeItem);
const mockSetItem = jest.mocked(AsyncStorage.setItem);
const mockCopyAsync = jest.mocked(FileSystem.copyAsync);
const mockDeleteAsync = jest.mocked(FileSystem.deleteAsync);
const mockGetInfoAsync = jest.mocked(FileSystem.getInfoAsync);
const mockMakeDirectoryAsync = jest.mocked(FileSystem.makeDirectoryAsync);
const profileId = '00000000-0000-0000-0000-000000000001';
let storage: Map<string, string>;
let existingFiles: Set<string>;

beforeEach(() => {
  storage = new Map();
  existingFiles = new Set();
  for (const mock of [
    mockGetItem,
    mockRemoveItem,
    mockSetItem,
    mockCopyAsync,
    mockDeleteAsync,
    mockGetInfoAsync,
    mockMakeDirectoryAsync,
  ]) {
    mock.mockReset();
  }
  mockGetItem.mockImplementation(async (key) => storage.get(key) ?? null);
  mockSetItem.mockImplementation(async (key, value) => {
    storage.set(key, value);
  });
  mockRemoveItem.mockImplementation(async (key) => {
    storage.delete(key);
  });
  mockMakeDirectoryAsync.mockResolvedValue(undefined);
  mockCopyAsync.mockImplementation(async ({ to }) => {
    existingFiles.add(to);
  });
  mockDeleteAsync.mockImplementation(async (uri) => {
    existingFiles.delete(uri);
  });
  mockGetInfoAsync.mockImplementation(async (uri) => ({
    exists: existingFiles.has(uri),
    isDirectory: false,
    modificationTime: 0,
    size: 100,
    uri,
  }));
});

describe('Profile media recovery', () => {
  it('copies a picker cache file into durable document storage before saving metadata', async () => {
    const persisted = await persistProfileMediaDraftItem(
      profileId,
      readyItem('avatar', 'file:///cache/cropped.jpg'),
    );

    expect(mockMakeDirectoryAsync).toHaveBeenCalledWith(
      'file:///documents/profile-edit-media/',
      { intermediates: true },
    );
    expect(mockCopyAsync).toHaveBeenCalledWith({
      from: 'file:///cache/cropped.jpg',
      to: `file:///documents/profile-edit-media/${profileId}-avatar.jpg`,
    });
    expect(persisted.asset.uri).toBe(
      `file:///documents/profile-edit-media/${profileId}-avatar.jpg`,
    );

    const restored = await restoreProfileMediaDraft(profileId);
    expect(restored.avatar).toEqual(
      expect.objectContaining({
        status: 'ready',
        asset: expect.objectContaining({ uri: persisted.asset.uri }),
      }),
    );
  });

  it('restores uploaded-but-unassociated metadata even when the local file is gone', async () => {
    const uri = `file:///documents/profile-edit-media/${profileId}-cover.jpg`;
    await persistProfileMediaDraftItem(profileId, {
      ...readyItem('cover', uri),
      status: 'uploaded-unassociated',
      uploadedAssetId: 'cover-asset-id',
      uploadedUrl: 'https://media/cover-asset-id',
    });
    existingFiles.delete(uri);

    const restored = await restoreProfileMediaDraft(profileId);

    expect(restored.cover).toEqual(
      expect.objectContaining({
        status: 'uploaded-unassociated',
        uploadedAssetId: 'cover-asset-id',
      }),
    );
    expect(mockGetInfoAsync).not.toHaveBeenCalledWith(uri);
  });

  it('clears metadata and deletes only its managed local file after association', async () => {
    const persisted = await persistProfileMediaDraftItem(
      profileId,
      readyItem('avatar', 'file:///cache/avatar.png', 'image/png'),
    );
    mockDeleteAsync.mockClear();

    await clearProfileMediaDraftItem(profileId, 'avatar');

    expect(mockDeleteAsync).toHaveBeenCalledWith(persisted.asset.uri, {
      idempotent: true,
    });
    expect(storage.size).toBe(0);
  });
});

function readyItem(
  slot: 'avatar' | 'cover',
  uri: string,
  mimeType = 'image/jpeg',
): ProfileEditStagedMedia {
  return {
    asset: {
      fileName: `picked.${mimeType === 'image/png' ? 'png' : 'jpg'}`,
      mimeType,
      uri,
    },
    slot,
    status: 'ready',
  };
}
