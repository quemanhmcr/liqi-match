import { describe, expect, it, vi } from 'vitest';

import {
  processMedia,
  recordMediaAnomaly,
} from '../src/application/process-media';
import type {
  MediaObjectStore,
  MediaRepository,
} from '../src/application/ports';
import { BasicImageMediaProcessor } from '../src/domain/media/media-processor';
import type { MediaAsset } from '../src/domain/media/media-types';

const job = {
  type: 'media_processing_requested' as const,
  assetId: 'asset-id',
  objectKey: 'chat/asset.jpg',
};
const asset: MediaAsset = {
  id: job.assetId,
  owner_id: 'owner-id',
  purpose: 'chat_attachment',
  object_key: job.objectKey,
  mime_type: 'image/jpeg',
  byte_size: 4,
  visibility: 'conversation_members',
  status: 'uploaded',
  moderation_status: 'pending',
  deleted_at: null,
};

function repository(patch: Partial<MediaRepository> = {}): MediaRepository {
  return {
    findById: vi.fn(async () => asset),
    isConversationMemberForAsset: vi.fn(),
    markDeleted: vi.fn(),
    markReady: vi.fn(),
    markRejected: vi.fn(),
    ...patch,
  };
}

function objectStore(
  bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
): MediaObjectStore {
  const object = {
    arrayBuffer: async () => bytes.buffer,
    body: null,
    etag: 'etag',
    httpEtag: 'etag',
    key: job.objectKey,
    size: bytes.length,
    uploaded: new Date(),
    version: 'v1',
    writeHttpMetadata: vi.fn(),
    checksums: {},
    customMetadata: {},
    httpMetadata: {},
    range: undefined,
    storageClass: 'Standard',
  } as unknown as R2ObjectBody;
  return { delete: vi.fn(), get: vi.fn(async () => object) };
}

describe('processMedia', () => {
  it('validates uploaded bytes and promotes the asset exactly once', async () => {
    const repo = repository();
    await processMedia({
      job,
      objectStore: objectStore(),
      processor: new BasicImageMediaProcessor(),
      repository: repo,
    });
    expect(repo.markReady).toHaveBeenCalledWith(job);
    expect(repo.markRejected).not.toHaveBeenCalled();
  });

  it('rejects a missing object instead of acknowledging without authority update', async () => {
    const repo = repository();
    await processMedia({
      job,
      objectStore: { delete: vi.fn(), get: vi.fn(async () => null) },
      processor: new BasicImageMediaProcessor(),
      repository: repo,
    });
    expect(repo.markRejected).toHaveBeenCalledWith(job, 'object_missing');
  });

  it('rejects mismatched bytes and keeps ready/rejected retries idempotent', async () => {
    const repo = repository();
    await processMedia({
      job,
      objectStore: objectStore(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
      processor: new BasicImageMediaProcessor(),
      repository: repo,
    });
    expect(repo.markRejected).toHaveBeenCalledWith(job, 'mime_mismatch');

    const readyRepo = repository({
      findById: vi.fn(async () => ({ ...asset, status: 'ready' })),
    });
    await processMedia({
      job,
      objectStore: objectStore(),
      processor: new BasicImageMediaProcessor(),
      repository: readyRepo,
    });
    expect(readyRepo.markReady).not.toHaveBeenCalled();
  });

  it('persists read-time validation anomalies', async () => {
    const repo = repository();
    await recordMediaAnomaly({
      message: {
        type: 'media_validation_failed',
        assetId: job.assetId,
        objectKey: job.objectKey,
        error: 'mime_mismatch',
      },
      repository: repo,
    });
    expect(repo.markRejected).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: job.assetId }),
      'mime_mismatch',
    );
  });
});
