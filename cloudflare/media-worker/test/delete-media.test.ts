import { describe, expect, it, vi } from 'vitest';

import { deleteMedia } from '../src/application/delete-media';
import type {
  MediaObjectStore,
  MediaRepository,
} from '../src/application/ports';

describe('deleteMedia', () => {
  it('deletes storage before committing the metadata transition', async () => {
    const calls: string[] = [];
    const objectStore: MediaObjectStore = {
      delete: vi.fn(async () => {
        calls.push('object');
      }),
      get: vi.fn(),
    };
    const repository: MediaRepository = {
      findById: vi.fn(),
      isConversationMemberForAsset: vi.fn(),
      markDeleted: vi.fn(async () => {
        calls.push('metadata');
      }),
    };
    await deleteMedia({
      job: {
        type: 'media_delete_requested',
        assetId: 'asset-id',
        objectKey: 'media/object.webp',
      },
      now: () => new Date('2026-07-11T00:00:00.000Z'),
      objectStore,
      repository,
    });
    expect(calls).toEqual(['object', 'metadata']);
    expect(repository.markDeleted).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'asset-id' }),
      '2026-07-11T00:00:00.000Z',
    );
  });
});
