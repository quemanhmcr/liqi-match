import { describe, expect, it, vi } from 'vitest';

import { authorizeMediaRequest } from '../src/application/authorize-media';
import type {
  IdentityVerifier,
  MediaRepository,
} from '../src/application/ports';
import type { MediaAsset } from '../src/domain/media/media-types';

const conversationAsset: MediaAsset = {
  id: 'asset-id',
  owner_id: 'owner-id',
  purpose: 'chat_attachment',
  object_key: 'chat/owner-id/asset.webp',
  mime_type: 'image/webp',
  byte_size: 42,
  visibility: 'conversation_members',
  status: 'ready',
  moderation_status: 'approved',
  deleted_at: null,
};

function dependencies({ member = false, userId = 'member-id' } = {}) {
  const identity: IdentityVerifier = {
    verify: vi.fn(async () => ({ userId })),
  };
  const repository: MediaRepository = {
    findById: vi.fn(),
    isConversationMemberForAsset: vi.fn(async () => member),
    markDeleted: vi.fn(),
    markReady: vi.fn(),
    markRejected: vi.fn(),
  };
  return { identity, repository };
}

describe('authorizeMediaRequest', () => {
  it('does not invoke identity infrastructure for a public asset', async () => {
    const deps = dependencies();
    const result = await authorizeMediaRequest({
      asset: { ...conversationAsset, visibility: 'public' },
      bearerToken: undefined,
      ...deps,
    });
    expect(result).toEqual({ authenticated: false, allowed: true });
    expect(deps.identity.verify).not.toHaveBeenCalled();
  });

  it('allows an owner without a membership query', async () => {
    const deps = dependencies({ userId: 'owner-id' });
    const result = await authorizeMediaRequest({
      asset: conversationAsset,
      bearerToken: 'token',
      ...deps,
    });
    expect(result.allowed).toBe(true);
    expect(deps.repository.isConversationMemberForAsset).not.toHaveBeenCalled();
  });

  it('delegates conversation access to the repository port', async () => {
    const deps = dependencies({ member: true });
    const result = await authorizeMediaRequest({
      asset: conversationAsset,
      bearerToken: 'token',
      ...deps,
    });
    expect(result.allowed).toBe(true);
    expect(deps.repository.isConversationMemberForAsset).toHaveBeenCalledWith(
      'asset-id',
      'member-id',
    );
  });
});
