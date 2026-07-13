import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import {
  clearProfileMediaDraftItem,
  persistProfileMediaDraftItem,
  restoreProfileMediaDraft,
} from '@/features/profile/edit/model/profile-media-picker-recovery';
import { makeProfileMediaItem } from './profile-edit-test-fixtures';

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
const storageKey = `profile-edit:staged-media:v1:${profileId}`;
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
  it('copies a picker cache file into durable document storage before saving canonical metadata', async () => {
    const persisted = await persistProfileMediaDraftItem(
      profileId,
      makeProfileMediaItem({
        localId: 'avatar:0:picker-1',
        slot: 'avatar',
        status: 'ready',
        uri: 'file:///cache/cropped.jpg',
      }),
    );

    expect(mockMakeDirectoryAsync).toHaveBeenCalledWith(
      'file:///documents/profile-edit-media/',
      { intermediates: true },
    );
    expect(mockCopyAsync).toHaveBeenCalledWith({
      from: 'file:///cache/cropped.jpg',
      to: `file:///documents/profile-edit-media/${profileId}-avatar-avatar_0_picker-1.jpg`,
    });
    expect(persisted.asset.uri).toContain('/profile-edit-media/');
    expect(persisted.persistedAt).not.toBeNull();

    const restored = await restoreProfileMediaDraft(profileId);
    expect(restored.avatar).toEqual(
      expect.objectContaining({
        localId: 'avatar:0:picker-1',
        status: 'ready',
        asset: expect.objectContaining({ uri: persisted.asset.uri }),
      }),
    );
  });

  it('restores uploaded media even when the local file is gone', async () => {
    const item = makeProfileMediaItem({
      assetId: 'cover-asset-id',
      localId: 'cover:0:uploaded-1',
      slot: 'cover',
      status: 'uploaded',
    });
    await persistProfileMediaDraftItem(profileId, item);
    existingFiles.clear();

    const restored = await restoreProfileMediaDraft(profileId);

    expect(restored.cover).toEqual(
      expect.objectContaining({
        status: 'uploaded',
        uploadedAssetId: 'cover-asset-id',
      }),
    );
    expect(mockGetInfoAsync).not.toHaveBeenCalledWith(
      expect.stringContaining('cover:0:uploaded-1'),
    );
  });

  it('records cleanup attempt, deletes only its managed local file, then removes metadata', async () => {
    const persisted = await persistProfileMediaDraftItem(
      profileId,
      makeProfileMediaItem({
        localId: 'avatar:0:cleanup-1',
        slot: 'avatar',
        status: 'ready',
        uri: 'file:///cache/avatar.png',
      }),
    );
    mockDeleteAsync.mockClear();
    mockSetItem.mockClear();

    await clearProfileMediaDraftItem(profileId, 'avatar');

    expect(mockSetItem).toHaveBeenCalledWith(
      storageKey,
      expect.stringContaining('"requestedAt"'),
    );
    expect(mockDeleteAsync).toHaveBeenCalledWith(persisted.asset.uri, {
      idempotent: true,
    });
    expect(storage.size).toBe(0);
  });

  it('migrates v1 uploaded-unassociated metadata to canonical v2 uploaded status', async () => {
    storage.set(
      storageKey,
      JSON.stringify({
        slots: {
          cover: {
            asset: {
              fileName: 'cover.jpg',
              fileSize: 1024,
              height: 512,
              mimeType: 'image/jpeg',
              uri: 'file:///documents/profile-edit-media/legacy-cover.jpg',
              width: 512,
            },
            error: undefined,
            persistedAt: '2026-07-13T02:00:00.000Z',
            slot: 'cover',
            status: 'uploaded-unassociated',
            uploadedAssetId: 'legacy-cover-asset',
            uploadedUrl: 'https://media/legacy-cover-asset',
          },
        },
        version: 1,
      }),
    );

    const restored = await restoreProfileMediaDraft(profileId);

    expect(restored.cover).toEqual(
      expect.objectContaining({
        localId: expect.stringMatching(/^cover:0:legacy-/),
        status: 'uploaded',
        uploadedAssetId: 'legacy-cover-asset',
      }),
    );
    const migrated = JSON.parse(storage.get(storageKey) ?? '{}') as {
      slots?: { cover?: { status?: string } };
      version?: number;
    };
    expect(migrated.version).toBe(2);
    expect(migrated.slots?.cover?.status).toBe('uploaded');
  });
});
