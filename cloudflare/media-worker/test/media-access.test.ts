import { describe, expect, it } from 'vitest';

import {
  decideMediaAccess,
  isReadyForDelivery,
} from '../src/domain/media/media-access';
import type { MediaAsset } from '../src/domain/media/media-types';

const asset: MediaAsset = {
  id: 'asset-id',
  owner_id: 'owner-id',
  object_key: 'avatar/owner-id/object.webp',
  mime_type: 'image/webp',
  byte_size: 42,
  visibility: 'public',
  status: 'ready',
  moderation_status: 'approved',
  deleted_at: null,
};

describe('media delivery policy', () => {
  it('keeps public, owner, conversation, and denied paths explicit', () => {
    expect(decideMediaAccess(asset, undefined)).toBe('allow-public');
    expect(
      decideMediaAccess(
        { ...asset, visibility: 'moderators_only' },
        'owner-id',
      ),
    ).toBe('allow-owner');
    expect(
      decideMediaAccess(
        { ...asset, visibility: 'conversation_members' },
        'member-id',
      ),
    ).toBe('check-conversation-membership');
    expect(
      decideMediaAccess({ ...asset, visibility: 'matched_users' }, 'stranger'),
    ).toBe('deny');
  });

  it('serves only non-deleted, approved, ready media', () => {
    expect(isReadyForDelivery(asset)).toBe(true);
    expect(isReadyForDelivery({ ...asset, status: 'uploaded' })).toBe(false);
    expect(
      isReadyForDelivery({ ...asset, moderation_status: 'rejected' }),
    ).toBe(false);
    expect(isReadyForDelivery({ ...asset, deleted_at: '2026-01-01' })).toBe(
      false,
    );
  });
});
