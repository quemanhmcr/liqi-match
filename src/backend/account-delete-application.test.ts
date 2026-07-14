import { describe, expect, it, jest } from '@jest/globals';

import {
  AccountDeletionApplicationError,
  executeAccountDeletion,
  type AccountDeletionPorts,
} from '../../supabase/functions/account-delete/application';

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
        profileFound: true,
      };
    },
    async deleteMedia(asset) {
      calls.push(`deleteMedia:${asset.id}`);
      return { ok: true, status: 204 };
    },
    async cleanupProfileData() {
      calls.push('cleanupProfileData');
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
      'cleanupProfileData',
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
    expect(testPorts.calls).not.toContain('cleanupProfileData');
  });

  it('never deletes Auth after partial database cleanup', async () => {
    const deleteAuthUser = jest.fn<() => Promise<void>>();
    const testPorts = ports({
      deleteAuthUser,
      async cleanupProfileData() {
        testPorts.calls.push('cleanupProfileData');
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
