import type { MediaRepository } from '../../application/ports';
import type {
  DeleteMediaJob,
  MediaAsset,
} from '../../domain/media/media-types';
import type { WorkerEnv } from '../../platform/env';

export class SupabaseMediaRepository implements MediaRepository {
  constructor(private readonly env: WorkerEnv) {}

  async findById(assetId: string): Promise<MediaAsset | undefined> {
    const url = this.url('/rest/v1/media_assets');
    url.searchParams.set(
      'select',
      'id,owner_id,object_key,mime_type,byte_size,visibility,status,moderation_status,deleted_at',
    );
    url.searchParams.set('id', `eq.${assetId}`);
    url.searchParams.set('limit', '1');
    const rows = await this.json<MediaAsset[]>(url);
    return rows[0];
  }

  async isConversationMemberForAsset(assetId: string, userId: string) {
    const messagesUrl = this.url('/rest/v1/messages');
    messagesUrl.searchParams.set('select', 'conversation_id');
    messagesUrl.searchParams.set('body', `like.*${assetId}*`);
    messagesUrl.searchParams.set('limit', '20');
    const messages = await this.json<Array<{ conversation_id: string }>>(
      messagesUrl,
      false,
    );
    const conversationIds = [
      ...new Set(messages.map((row) => row.conversation_id)),
    ];
    if (conversationIds.length === 0) return false;

    const membershipUrl = this.url('/rest/v1/conversation_members');
    membershipUrl.searchParams.set('select', 'conversation_id');
    membershipUrl.searchParams.set('profile_id', `eq.${userId}`);
    membershipUrl.searchParams.set(
      'conversation_id',
      `in.(${conversationIds.join(',')})`,
    );
    membershipUrl.searchParams.set('limit', '1');
    const memberships = await this.json<unknown[]>(membershipUrl, false);
    return memberships.length > 0;
  }

  async markDeleted(job: DeleteMediaJob, deletedAt: string) {
    const url = this.url('/rest/v1/media_assets');
    url.searchParams.set('id', `eq.${job.assetId}`);
    url.searchParams.set('status', 'in.(delete_pending,deleted)');
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        ...this.headers(),
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: 'deleted', deleted_at: deletedAt }),
    });
    if (!response.ok) {
      throw new Error(`Failed to mark media deleted: ${response.status}`);
    }
  }

  private url(path: string) {
    return new URL(path, this.env.SUPABASE_URL);
  }

  private headers() {
    return {
      apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
    };
  }

  private async json<T>(url: URL, throwOnError = true): Promise<T> {
    const response = await fetch(url, { headers: this.headers() });
    if (!response.ok) {
      if (!throwOnError) return [] as T;
      throw new Error(`Supabase metadata lookup failed: ${response.status}`);
    }
    return (await response.json()) as T;
  }
}
