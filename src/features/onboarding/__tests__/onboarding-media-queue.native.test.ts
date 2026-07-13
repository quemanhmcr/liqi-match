import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import { uploadMediaBatch } from '@/shared/services/media-upload';
import { supabaseRest } from '@/shared/services/supabase-rest';

import type { OnboardingMediaQueueItem } from '../model/onboarding-media-state';
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
      status: 'error',
      uploadedAssetId: 'asset-1',
      uploadedObjectKey: 'owner/asset-1.jpg',
    });

    await expect(
      uploadOnboardingMediaQueueItem(session, item),
    ).resolves.toEqual(expect.objectContaining({ status: 'associated' }));

    expect(mockUploadMediaBatch).not.toHaveBeenCalled();
    expect(mockSupabaseRest).toHaveBeenCalledWith(
      'profiles?id=eq.account-a',
      expect.objectContaining({
        body: { avatar_media_id: 'asset-1' },
        method: 'PATCH',
      }),
    );
  });

  it('skips completed items and persists a failed item for retry', async () => {
    const completed = mediaItem({
      localId: 'cover:0:done',
      slot: 'cover',
      status: 'uploaded',
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
    expect(changes.map((item) => item.status)).toEqual(['uploading', 'error']);
    expect(result.failed).toEqual([
      expect.objectContaining({
        error: 'R2 unavailable',
        localId: 'wall:2:pending',
        position: 2,
        status: 'error',
      }),
    ]);
  });
});

function mediaItem(
  patch: Partial<OnboardingMediaQueueItem> = {},
): OnboardingMediaQueueItem {
  return {
    localId: 'avatar:0:selected',
    localUri: 'file:///avatar.jpg',
    mimeType: 'image/jpeg',
    position: 0,
    slot: 'avatar',
    status: 'selected',
    ...patch,
  };
}
