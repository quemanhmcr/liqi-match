import { deleteMedia } from '../../application/delete-media';
import type {
  MediaObjectStore,
  MediaRepository,
} from '../../application/ports';
import type { MediaQueueMessage } from '../../domain/media/media-types';

export async function consumeMediaQueue(input: {
  batch: MessageBatch<MediaQueueMessage>;
  objectStore: MediaObjectStore;
  repository: MediaRepository;
}) {
  for (const message of input.batch.messages) {
    try {
      if (message.body.type === 'media_delete_requested') {
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
