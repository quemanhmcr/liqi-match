import { describe, expect, it } from '@jest/globals';

import { stageProfileMedia } from '@/features/profile/edit/model/profile-media-staging';

const baseAsset = {
  fileName: 'avatar.jpg',
  fileSize: 1024,
  height: 512,
  mimeType: 'image/jpeg',
  uri: 'file:///cache/avatar.jpg',
  width: 512,
};

describe('stageProfileMedia', () => {
  it('creates a canonical ready item without uploading it', () => {
    const staged = stageProfileMedia('avatar', baseAsset);

    expect(staged).toMatchObject({
      failure: null,
      position: 0,
      slot: 'avatar',
      status: 'ready',
      uploadedAssetId: null,
      uploadedObjectKey: null,
    });
    expect(staged.localId).toMatch(/^avatar:0:/);
    expect(staged.retry).toEqual({
      attemptCount: 0,
      lastAttemptAt: null,
      retryable: true,
    });
  });

  it('rejects unsupported image formats before save with structured failure', () => {
    expect(
      stageProfileMedia('avatar', {
        ...baseAsset,
        fileName: 'avatar.gif',
        mimeType: 'image/gif',
        uri: 'file:///cache/avatar.gif',
      }),
    ).toMatchObject({
      failure: {
        code: 'unsupported_media_type',
        message: expect.stringContaining('JPG, PNG hoặc WebP'),
      },
      status: 'failed',
    });
  });

  it('rejects a cover larger than its staging limit', () => {
    expect(
      stageProfileMedia('cover', {
        ...baseAsset,
        fileName: 'cover.jpg',
        fileSize: 8 * 1024 * 1024 + 1,
        uri: 'file:///cache/cover.jpg',
      }),
    ).toMatchObject({
      failure: {
        code: 'media_too_large',
        message: expect.stringContaining('8 MB'),
      },
      status: 'failed',
    });
  });
});
