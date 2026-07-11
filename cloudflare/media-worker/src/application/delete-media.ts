import type { DeleteMediaJob } from '../domain/media/media-types';
import type { MediaObjectStore, MediaRepository } from './ports';

export async function deleteMedia(input: {
  job: DeleteMediaJob;
  objectStore: MediaObjectStore;
  repository: MediaRepository;
  now?: () => Date;
}) {
  await input.objectStore.delete(input.job.objectKey);
  await input.repository.markDeleted(
    input.job,
    (input.now ?? (() => new Date()))().toISOString(),
  );
}
