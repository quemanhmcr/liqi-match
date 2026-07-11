import type {
  DeleteMediaJob,
  MediaAsset,
  MediaQueueMessage,
} from '../domain/media/media-types';

export interface MediaRepository {
  findById(assetId: string): Promise<MediaAsset | undefined>;
  isConversationMemberForAsset(
    assetId: string,
    userId: string,
  ): Promise<boolean>;
  markDeleted(job: DeleteMediaJob, deletedAt: string): Promise<void>;
}

export interface IdentityVerifier {
  verify(token: string): Promise<{ userId: string }>;
}

export interface MediaObjectStore {
  delete(objectKey: string): Promise<void>;
  get(objectKey: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
}

export interface MediaEventQueue {
  send(message: MediaQueueMessage): Promise<void>;
}
