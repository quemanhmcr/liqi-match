import { describe, expect, it } from '@jest/globals';

import { stageProfileMedia } from '@/features/profile/edit/model/profile-media-staging';

describe('stageProfileMedia', () => {
  it('keeps a valid local image ready without uploading it', () => {
    const staged = stageProfileMedia('avatar', {
      fileSize: 1024,
      height: 512,
      mimeType: 'image/jpeg',
      uri: 'file:///cache/avatar.jpg',
      width: 512,
    });

    expect(staged).toMatchObject({ slot: 'avatar', status: 'ready' });
    expect(staged.uploadedAssetId).toBeUndefined();
  });

  it('rejects unsupported image formats before save', () => {
    expect(
      stageProfileMedia('avatar', {
        mimeType: 'image/gif',
        uri: 'file:///cache/avatar.gif',
      }),
    ).toMatchObject({
      error: expect.stringContaining('JPG, PNG hoặc WebP'),
      status: 'failed',
    });
  });

  it('rejects a cover larger than its staging limit', () => {
    expect(
      stageProfileMedia('cover', {
        fileSize: 8 * 1024 * 1024 + 1,
        mimeType: 'image/jpeg',
        uri: 'file:///cache/cover.jpg',
      }),
    ).toMatchObject({
      error: expect.stringContaining('8 MB'),
      status: 'failed',
    });
  });
});
