import { deleteMedia } from '../../application/delete-media';
import {
  processMedia,
  recordMediaAnomaly,
} from '../../application/process-media';
import type {
  MediaObjectStore,
  MediaRepository,
} from '../../application/ports';
import { BasicImageMediaProcessor } from '../../domain/media/media-processor';
import type { MediaQueueMessage } from '../../domain/media/media-types';

export async function consumeMediaQueue(input: {
  batch: MessageBatch<MediaQueueMessage>;
  objectStore: MediaObjectStore;
  repository: MediaRepository;
}) {
  for (const message of input.batch.messages) {
    try {
      if (message.body.type === 'media_processing_requested') {
        await processMedia({
          job: message.body,
          objectStore: input.objectStore,
          processor: new BasicImageMediaProcessor(),
          repository: input.repository,
        });
      } else if (
        message.body.type === 'media_object_missing' ||
        message.body.type === 'media_validation_failed'
      ) {
        await recordMediaAnomaly({
          message: message.body,
          repository: input.repository,
        });
      } else if (message.body.type === 'media_delete_requested') {
        await deleteMedia({
          job: message.body,
          objectStore: input.objectStore,
          repository: input.repository,
        });
      }
      message.ack();
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          messageId: message.id,
          body: message.body,
          message: error instanceof Error ? error.message : 'unknown_error',
        }),
      );
      message.retry();
    }
  }
}
