import type { MediaProcessor } from '../domain/media/media-processor';
import type {
  MediaProcessingJob,
  MediaQueueMessage,
} from '../domain/media/media-types';
import type { MediaObjectStore, MediaRepository } from './ports';

export async function processMedia(input: {
  job: MediaProcessingJob;
  objectStore: MediaObjectStore;
  processor: MediaProcessor;
  repository: MediaRepository;
}) {
  const asset = await input.repository.findById(input.job.assetId);
  if (!asset || asset.object_key !== input.job.objectKey) return;
  if (asset.status === 'ready' || asset.status === 'rejected') return;
  if (asset.status !== 'uploaded') {
    throw new Error(`media_not_processable:${asset.status}`);
  }

  const object = await input.objectStore.get(asset.object_key);
  if (!object) {
    await reject(input.repository, input.job, 'object_missing');
    return;
  }
  if (object.size !== asset.byte_size) {
    await reject(input.repository, input.job, 'byte_size_mismatch');
    return;
  }

  const sample = await input.objectStore.get(asset.object_key, {
    range: { offset: 0, length: 32 },
  });
  const bytes = sample
    ? new Uint8Array(await sample.arrayBuffer())
    : new Uint8Array();
  const validation = input.processor.validateMagicBytes(bytes, asset.mime_type);
  if (!validation.ok) {
    await reject(
      input.repository,
      input.job,
      validation.error ?? 'media_validation_failed',
    );
    return;
  }

  await input.repository.markReady(input.job);
}

export async function recordMediaAnomaly(input: {
  message: Extract<
    MediaQueueMessage,
    { type: 'media_object_missing' | 'media_validation_failed' }
  >;
  repository: MediaRepository;
}) {
  await input.repository.markRejected(
    input.message,
    input.message.error ?? input.message.type,
  );
}

function reject(
  repository: MediaRepository,
  job: MediaProcessingJob,
  reason: string,
) {
  return repository.markRejected(job, reason);
}
