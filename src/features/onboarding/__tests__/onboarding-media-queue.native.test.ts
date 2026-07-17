import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import { uploadMediaBatch } from '@/shared/services/media-upload';
import { supabaseRest } from '@/shared/services/supabase-rest';

import {
  createOnboardingMediaQueueItem,
  type OnboardingMediaQueueItem,
} from '../model/onboarding-media-state';
import {
  runOnboardingMediaQueue,
  uploadOnboardingMediaQueueItem,
  validateOnboardingMediaSelection,
} from '../services/onboarding-media-queue-service';

jest.mock('@/shared/services/media-upload', () => ({
  uploadMediaBatch: jest.fn(),
}));

jest.mock('@/shared/services/supabase-rest', () => ({
  supabaseRest: jest.fn(),
}));

const mockUploadMediaBatch = jest.mocked(uploadMediaBatch);
const mockSupabaseRest = jest.mocked(supabaseRest);
const session: AuthSession = {
  accessToken: 'access-token',
  expiresAt: 4102444800,
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  user: { id: 'account-a', user_metadata: {} },
};

describe('onboarding media queue', () => {
  beforeEach(() => {
    mockUploadMediaBatch.mockReset();
    mockSupabaseRest.mockReset();
  });

  it('validates unsupported files when they are selected', () => {
    expect(() =>
      validateOnboardingMediaSelection(
        {
          assetId: null,
          base64: null,
          duration: null,
          exif: null,
          fileName: 'avatar.gif',
          fileSize: 100,
          height: 100,
          mimeType: 'image/gif',
          pairedVideoAsset: null,
          type: 'image',
          uri: 'file:///avatar.gif',
          width: 100,
        },
        'avatar',
      ),
    ).toThrow('Định dạng ảnh chưa được hỗ trợ');
  });

  it('retries avatar association without uploading the file again', async () => {
    mockSupabaseRest.mockResolvedValueOnce(undefined);
    const item = mediaItem({
      failure: {
        code: 'association_failed',
        message: 'profile patch failed',
      },
      status: 'failed',
      uploadedAssetId: 'asset-1',
      uploadedObjectKey: 'owner/asset-1.jpg',
    });

    await expect(
      uploadOnboardingMediaQueueItem(session, item),
    ).resolves.toEqual(
      expect.objectContaining({ failure: null, status: 'associated' }),
    );

    expect(mockUploadMediaBatch).not.toHaveBeenCalled();
    expect(mockSupabaseRest).toHaveBeenCalledWith(
      'profiles?id=eq.account-a',
      expect.objectContaining({
        body: { avatar_media_id: 'asset-1' },
        method: 'PATCH',
      }),
    );
  });

  it('associates an already-uploaded cover without uploading again', async () => {
    mockSupabaseRest
      .mockResolvedValueOnce([{ media_summary: { gender: 'hidden' } }])
      .mockResolvedValueOnce(undefined);
    const item = mediaItem({
      localId: 'cover:0:uploaded',
      slot: 'cover',
      status: 'uploaded',
      uploadedAssetId: 'cover-asset',
      uploadedObjectKey: 'owner/cover-asset.jpg',
    });

    await expect(
      uploadOnboardingMediaQueueItem(session, item),
    ).resolves.toEqual(
      expect.objectContaining({ failure: null, status: 'associated' }),
    );

    expect(mockUploadMediaBatch).not.toHaveBeenCalled();
    expect(mockSupabaseRest).toHaveBeenNthCalledWith(
      2,
      'profile_habits?profile_id=eq.account-a',
      expect.objectContaining({
        body: {
          media_summary: {
            cover_media_id: 'cover-asset',
            gender: 'hidden',
          },
        },
        method: 'PATCH',
      }),
    );
  });

  it('associates a wall asset at its persisted position without uploading again', async () => {
    mockSupabaseRest
      .mockResolvedValueOnce([
        { media_summary: { wall_media_ids: ['wall-a', null, null, null] } },
      ])
      .mockResolvedValueOnce(undefined);
    const item = mediaItem({
      localId: 'wall:2:uploaded',
      position: 2,
      slot: 'wall',
      status: 'uploaded',
      uploadedAssetId: 'wall-c',
      uploadedObjectKey: 'owner/wall-c.jpg',
    });

    await uploadOnboardingMediaQueueItem(session, item);

    expect(mockUploadMediaBatch).not.toHaveBeenCalled();
    expect(mockSupabaseRest).toHaveBeenNthCalledWith(
      2,
      'profile_habits?profile_id=eq.account-a',
      expect.objectContaining({
        body: {
          media_summary: expect.objectContaining({
            wall_count: 2,
            wall_media_ids: ['wall-a', null, 'wall-c', null],
            wall_positions: [0, 2],
          }),
        },
        method: 'PATCH',
      }),
    );
  });

  it('retains the uploaded asset when avatar association fails', async () => {
    mockUploadMediaBatch.mockResolvedValueOnce([
      {
        assetId: 'asset-1',
        objectKey: 'owner/asset-1.jpg',
        purpose: 'personal_avatar',
        slot: 'avatar',
      },
    ]);
    mockSupabaseRest.mockRejectedValueOnce(new Error('profile patch failed'));
    const changes: OnboardingMediaQueueItem[] = [];

    const result = await runOnboardingMediaQueue({
      items: [mediaItem()],
      onItemChange: async (item) => {
        changes.push(item);
      },
      session,
    });

    expect(changes.map((item) => item.status)).toEqual([
      'uploading',
      'uploaded',
      'failed',
    ]);
    expect(changes[0]?.retry).toEqual(
      expect.objectContaining({
        attemptCount: 1,
        lastAttemptAt: expect.any(String),
      }),
    );
    expect(result.failed[0]).toEqual(
      expect.objectContaining({
        failure: {
          code: 'association_failed',
          message: 'profile patch failed',
        },
        uploadedAssetId: 'asset-1',
        uploadedObjectKey: 'owner/asset-1.jpg',
      }),
    );

    mockSupabaseRest.mockResolvedValueOnce(undefined);
    await uploadOnboardingMediaQueueItem(session, result.failed[0]!);
    expect(mockUploadMediaBatch).toHaveBeenCalledTimes(1);
  });

  it('skips completed items and persists a structured failed item for retry', async () => {
    const completed = mediaItem({
      localId: 'cover:0:done',
      slot: 'cover',
      status: 'associated',
      uploadedAssetId: 'cover-asset',
    });
    const pending = mediaItem({
      localId: 'wall:2:pending',
      position: 2,
      slot: 'wall',
    });
    mockUploadMediaBatch.mockRejectedValueOnce(new Error('R2 unavailable'));
    const changes: OnboardingMediaQueueItem[] = [];

    const result = await runOnboardingMediaQueue({
      items: [completed, pending],
      onItemChange: async (item) => {
        changes.push(item);
      },
      session,
    });

    expect(mockUploadMediaBatch).toHaveBeenCalledTimes(1);
    expect(changes.map((item) => item.status)).toEqual(['uploading', 'failed']);
    expect(result.failed).toEqual([
      expect.objectContaining({
        failure: { code: 'upload_failed', message: 'R2 unavailable' },
        localId: 'wall:2:pending',
        position: 2,
        status: 'failed',
      }),
    ]);
  });
});

function mediaItem(
  patch: Partial<OnboardingMediaQueueItem> = {},
): OnboardingMediaQueueItem {
  return {
    ...createOnboardingMediaQueueItem({
      asset: { mimeType: 'image/jpeg', uri: 'file:///avatar.jpg' },
      localId: 'avatar:0:selected',
      persistedAt: '2026-07-13T02:00:00.000Z',
      position: 0,
      slot: 'avatar',
    }),
    ...patch,
  };
}
