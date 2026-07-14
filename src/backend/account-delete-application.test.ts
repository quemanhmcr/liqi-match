import { describe, expect, it, jest } from '@jest/globals';

import {
  AccountDeletionApplicationError,
  executeAccountDeletion,
  type AccountDeletionPorts,
} from '../../supabase/functions/account-delete/application';
import {
  buildMessageRemovalTombstoneV1,
  buildMessageSenderIdentityFilterV1,
} from '../../supabase/functions/account-delete/message-tombstone';

const accountId = '01000000-0000-4000-8000-000000000401';
const command = {
  confirmation: 'DELETE',
  expectedLifecycleVersion: 3,
  idempotencyKey: 'account.delete.000000000401',
} as const;

function ports(
  overrides: Partial<AccountDeletionPorts> = {},
): AccountDeletionPorts & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async requestDeletion() {
      calls.push('requestDeletion');
      return {
        lifecycle: {
          playerId: '20000000-0000-4000-8000-000000000401',
          profileId: '30000000-0000-4000-8000-000000000401',
          state: 'deleting',
          version: 4,
        },
        repeated: false,
      };
    },
    async lookupResources() {
      calls.push('lookupResources');
      return {
        media: [
          { id: 'media-a', objectKey: 'account/media-a' },
          { id: 'media-b', objectKey: 'account/media-b' },
        ],
        playerId: '20000000-0000-4000-8000-000000000401',
        profileFound: true,
      };
    },
    async deleteMedia(asset) {
      calls.push(`deleteMedia:${asset.id}`);
      return { ok: true, status: 204 };
    },
    async cleanupProfileData(receivedAccountId, receivedPlayerId, deletedAt) {
      calls.push(
        `cleanupProfileData:${receivedAccountId}:${receivedPlayerId}:${deletedAt}`,
      );
      return [
        { name: 'profile', ok: true },
        { name: 'messages', ok: true },
      ];
    },
    async deleteAuthUser() {
      calls.push('deleteAuthUser');
    },
    now() {
      calls.push('now');
      return '2026-07-14T08:10:00.000Z';
    },
    ...overrides,
  };
}

describe('executeAccountDeletion', () => {
  it('orders lifecycle request, media cleanup, database cleanup, then Auth deletion', async () => {
    const testPorts = ports();

    await expect(
      executeAccountDeletion(accountId, command, testPorts),
    ).resolves.toEqual({
      cleanup: { attempted: 2, failed: [], succeeded: 2 },
      deletedAt: '2026-07-14T08:10:00.000Z',
      lifecycleVersion: 5,
      mediaDeleted: 2,
      playerId: '20000000-0000-4000-8000-000000000401',
      profileFound: true,
      profileId: '30000000-0000-4000-8000-000000000401',
      repeated: false,
      status: 'deleted',
    });
    expect(testPorts.calls).toEqual([
      'requestDeletion',
      'lookupResources',
      'deleteMedia:media-a',
      'deleteMedia:media-b',
      'now',
      'cleanupProfileData:01000000-0000-4000-8000-000000000401:20000000-0000-4000-8000-000000000401:2026-07-14T08:10:00.000Z',
      'deleteAuthUser',
    ]);
  });

  it('never deletes Auth when any R2 object cannot be deleted', async () => {
    const deleteAuthUser = jest.fn<() => Promise<void>>();
    const testPorts = ports({
      deleteAuthUser,
      async deleteMedia(asset) {
        testPorts.calls.push(`deleteMedia:${asset.id}`);
        return asset.id === 'media-b'
          ? { ok: false, status: 503 }
          : { ok: true, status: 204 };
      },
    });

    await expect(
      executeAccountDeletion(accountId, command, testPorts),
    ).rejects.toMatchObject({
      code: 'account_deletion_media_incomplete',
      retryable: true,
      status: 502,
    } satisfies Partial<AccountDeletionApplicationError>);
    expect(deleteAuthUser).not.toHaveBeenCalled();
    expect(
      testPorts.calls.some((call) => call.startsWith('cleanupProfileData:')),
    ).toBe(false);
  });

  it('never deletes Auth after partial database cleanup', async () => {
    const deleteAuthUser = jest.fn<() => Promise<void>>();
    const testPorts = ports({
      deleteAuthUser,
      async cleanupProfileData(receivedAccountId, receivedPlayerId, deletedAt) {
        testPorts.calls.push(
          `cleanupProfileData:${receivedAccountId}:${receivedPlayerId}:${deletedAt}`,
        );
        return [
          { name: 'profile', ok: true },
          { error: 'timeout', name: 'messages', ok: false },
        ];
      },
    });

    await expect(
      executeAccountDeletion(accountId, command, testPorts),
    ).rejects.toMatchObject({
      code: 'account_deletion_cleanup_incomplete',
      details: {
        failed: [{ error: 'timeout', name: 'messages' }],
      },
      retryable: true,
      status: 503,
    } satisfies Partial<AccountDeletionApplicationError>);
    expect(deleteAuthUser).not.toHaveBeenCalled();
  });

  it('continues cleanup for an idempotent lifecycle replay', async () => {
    const testPorts = ports({
      async requestDeletion() {
        testPorts.calls.push('requestDeletion');
        return {
          lifecycle: {
            playerId: '20000000-0000-4000-8000-000000000401',
            profileId: '30000000-0000-4000-8000-000000000401',
            state: 'deleting',
            version: 4,
          },
          repeated: true,
        };
      },
    });

    await expect(
      executeAccountDeletion(accountId, command, testPorts),
    ).resolves.toMatchObject({ repeated: true, status: 'deleted' });
    expect(testPorts.calls).toContain('deleteAuthUser');
  });

  it('fails closed before media cleanup when canonical PlayerId lookup disagrees with the deleting receipt', async () => {
    const deleteAuthUser = jest.fn<() => Promise<void>>();
    const testPorts = ports({
      deleteAuthUser,
      async lookupResources() {
        testPorts.calls.push('lookupResources');
        return {
          media: [{ id: 'media-a', objectKey: 'account/media-a' }],
          playerId: '20000000-0000-4000-8000-000000000999',
          profileFound: true,
        };
      },
    });

    await expect(
      executeAccountDeletion(accountId, command, testPorts),
    ).rejects.toMatchObject({
      code: 'account_deletion_identity_mismatch',
      retryable: false,
      status: 409,
    } satisfies Partial<AccountDeletionApplicationError>);
    expect(testPorts.calls).toEqual(['requestDeletion', 'lookupResources']);
    expect(deleteAuthUser).not.toHaveBeenCalled();
  });

  it('still cleans canonical conversation data when the legacy profile row is absent', async () => {
    const testPorts = ports({
      async lookupResources() {
        testPorts.calls.push('lookupResources');
        return {
          media: [],
          playerId: '20000000-0000-4000-8000-000000000401',
          profileFound: false,
        };
      },
    });

    await expect(
      executeAccountDeletion(accountId, command, testPorts),
    ).resolves.toMatchObject({ profileFound: false, status: 'deleted' });
    expect(
      testPorts.calls.some((call) => call.startsWith('cleanupProfileData:')),
    ).toBe(true);
  });

  it('builds the Conversation v1 tombstone without changing message identity or sequence fields', () => {
    const deletedAt = '2026-07-14T08:10:00.000Z';

    expect(buildMessageRemovalTombstoneV1(deletedAt)).toEqual({
      body: 'Tin nhắn đã bị xoá',
      content_kind_v1: 'system',
      content_v1: { eventType: 'message_removed', kind: 'system' },
      deleted_at: deletedAt,
      media_asset_id_v1: null,
    });
    expect(
      buildMessageSenderIdentityFilterV1(
        accountId,
        '20000000-0000-4000-8000-000000000401',
      ),
    ).toBe(
      'sender_id.eq.01000000-0000-4000-8000-000000000401,sender_player_id_v1.eq.20000000-0000-4000-8000-000000000401',
    );
  });

  it('rejects a provider response that is not deleting before cleanup', async () => {
    const testPorts = ports({
      async requestDeletion() {
        testPorts.calls.push('requestDeletion');
        return {
          lifecycle: {
            playerId: '20000000-0000-4000-8000-000000000401',
            profileId: '30000000-0000-4000-8000-000000000401',
            state: 'active',
            version: 3,
          },
          repeated: false,
        };
      },
    });

    await expect(
      executeAccountDeletion(accountId, command, testPorts),
    ).rejects.toMatchObject({ code: 'account_deletion_lifecycle_invalid' });
    expect(testPorts.calls).toEqual(['requestDeletion']);
  });
});
