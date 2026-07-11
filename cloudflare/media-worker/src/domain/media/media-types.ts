export type MediaVisibility =
  'public' | 'matched_users' | 'conversation_members' | 'moderators_only';

export type MediaAsset = {
  id: string;
  owner_id: string;
  object_key: string;
  mime_type: string;
  byte_size: number;
  visibility: MediaVisibility;
  status: string;
  moderation_status: string;
  deleted_at: string | null;
};

export type MediaQueueMessage =
  | {
      type: 'media_delete_requested';
      assetId: string;
      objectKey: string;
      requestId?: string;
    }
  | {
      type: 'media_object_missing' | 'media_validation_failed';
      assetId: string;
      objectKey: string;
      error?: string;
      requestId?: string;
    };

export type DeleteMediaJob = Extract<
  MediaQueueMessage,
  { type: 'media_delete_requested' }
>;
