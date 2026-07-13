import { describe, expect, it } from '@jest/globals';

import { PROFILE_LIMITS } from '../catalogs';
import {
  MediaStagingItemSchema,
  MediaStagingQueueSchema,
  MediaStagingTargetSchema,
  type MediaStagingItem,
} from '../media-staging';

function stagedItem(
  overrides: Partial<MediaStagingItem> = {},
): MediaStagingItem {
  return {
    asset: {
      fileName: 'avatar.jpg',
      fileSize: 1024,
      height: 512,
      mimeType: 'image/jpeg',
      uri: 'file:///durable/avatar.jpg',
      width: 512,
    },
    cleanup: {
      completedAt: null,
      failure: null,
      lastAttemptAt: null,
      requestedAt: null,
    },
    failure: null,
    localId: 'avatar:0:local-1',
    persistedAt: '2026-07-13T02:00:00.000Z',
    position: 0,
    retry: {
      attemptCount: 0,
      lastAttemptAt: null,
      retryable: true,
    },
    slot: 'avatar',
    status: 'ready',
    uploadedAssetId: null,
    uploadedObjectKey: null,
    ...overrides,
  };
}

describe('media staging contract', () => {
  it('accepts a durable neutral staged item', () => {
    const item = stagedItem();

    expect(MediaStagingItemSchema.parse(item)).toEqual(item);
  });

  it('uses uploaded for bytes awaiting association', () => {
    const item = stagedItem({
      retry: {
        attemptCount: 1,
        lastAttemptAt: '2026-07-13T02:01:00.000Z',
        retryable: true,
      },
      status: 'uploaded',
      uploadedAssetId: 'asset-1',
      uploadedObjectKey: 'owner/asset-1.jpg',
    });

    expect(MediaStagingItemSchema.parse(item).status).toBe('uploaded');
  });

  it('requires structured failure metadata for failed items', () => {
    expect(
      MediaStagingItemSchema.safeParse(stagedItem({ status: 'failed' }))
        .success,
    ).toBe(false);

    expect(
      MediaStagingItemSchema.safeParse(
        stagedItem({
          failure: { code: 'upload_interrupted', message: 'Upload stopped.' },
          status: 'failed',
        }),
      ).success,
    ).toBe(true);
  });

  it('requires uploaded asset identity after upload', () => {
    expect(
      MediaStagingItemSchema.safeParse(stagedItem({ status: 'uploaded' }))
        .success,
    ).toBe(false);
    expect(
      MediaStagingItemSchema.safeParse(stagedItem({ status: 'associated' }))
        .success,
    ).toBe(false);
  });

  it('enforces canonical slot positions', () => {
    expect(
      MediaStagingTargetSchema.safeParse({ slot: 'cover', position: 1 })
        .success,
    ).toBe(false);
    expect(
      MediaStagingTargetSchema.safeParse({
        slot: 'wall',
        position: PROFILE_LIMITS.wallMedia - 1,
      }).success,
    ).toBe(true);
    expect(
      MediaStagingTargetSchema.safeParse({
        slot: 'wall',
        position: PROFILE_LIMITS.wallMedia,
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate local IDs and duplicate slot positions', () => {
    expect(
      MediaStagingQueueSchema.safeParse([
        stagedItem(),
        stagedItem({
          localId: 'avatar:0:local-1',
          slot: 'cover',
        }),
      ]).success,
    ).toBe(false);

    expect(
      MediaStagingQueueSchema.safeParse([
        stagedItem(),
        stagedItem({ localId: 'avatar:0:local-2' }),
      ]).success,
    ).toBe(false);
  });

  it('keeps cleanup metadata neutral and internally consistent', () => {
    expect(
      MediaStagingItemSchema.safeParse(
        stagedItem({
          cleanup: {
            completedAt: '2026-07-13T02:03:00.000Z',
            failure: null,
            lastAttemptAt: '2026-07-13T02:02:00.000Z',
            requestedAt: null,
          },
        }),
      ).success,
    ).toBe(false);

    expect(
      MediaStagingItemSchema.safeParse(
        stagedItem({
          cleanup: {
            completedAt: '2026-07-13T02:03:00.000Z',
            failure: null,
            lastAttemptAt: '2026-07-13T02:02:00.000Z',
            requestedAt: '2026-07-13T02:01:00.000Z',
          },
        }),
      ).success,
    ).toBe(true);
  });
});
