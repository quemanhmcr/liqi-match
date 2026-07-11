import type { MediaEventQueue } from '../../application/ports';
import type { MediaQueueMessage } from '../../domain/media/media-types';

export class CloudflareMediaQueue implements MediaEventQueue {
  constructor(private readonly queue: Queue) {}
  async send(message: MediaQueueMessage) {
    await this.queue.send(message);
  }
}
