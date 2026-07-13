import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import type {
  ProfileEditDraft,
  ProfileEditForm,
  ProfileEditStagedMedia,
} from '@/features/profile/edit/model/profile-edit-model';
import {
  clearProfileMediaDraftItem,
  persistProfileMediaDraftItem,
} from '@/features/profile/edit/model/profile-media-picker-recovery';
import {
  ProfileEditCommandError,
  saveProfileGameProfile,
  saveProfileHabits,
  saveProfileHeroes,
  saveProfileIdentity,
  saveProfileMediaAssociation,
  saveProfileRoles,
  uploadStagedProfileMedia,
  withUploadedMedia,
} from '@/features/profile/edit/services/profile-edit-commands';
import { saveProfileEditChanges } from '@/features/profile/edit/services/profile-edit-coordinator';
import {
  clone,
  makeProfileEditDraft,
  makeProfileEditForm,
  makeProfileMediaItem,
} from './profile-edit-test-fixtures';

jest.mock(
  '@/features/profile/edit/model/profile-media-picker-recovery',
  () => ({
    clearProfileMediaDraftItem: jest.fn(async () => undefined),
    persistProfileMediaDraftItem: jest.fn(async (_profileId, item) => item),
  }),
);

jest.mock('@/features/profile/edit/services/profile-edit-commands', () => {
  class MockProfileEditCommandError extends Error {
    readonly associatedMediaSlots: readonly ('avatar' | 'cover')[];
    readonly partiallySaved: boolean;

    constructor(
      message: string,
      options?: {
        associatedMediaSlots?: readonly ('avatar' | 'cover')[];
        partiallySaved?: boolean;
      },
    ) {
      super(message);
      this.name = 'ProfileEditCommandError';
      this.associatedMediaSlots = options?.associatedMediaSlots ?? [];
      this.partiallySaved = options?.partiallySaved ?? false;
    }
  }

  return {
    ProfileEditCommandError: MockProfileEditCommandError,
    saveProfileGameProfile: jest.fn(async () => undefined),
    saveProfileHabits: jest.fn(async () => undefined),
    saveProfileHeroes: jest.fn(async () => undefined),
    saveProfileIdentity: jest.fn(async () => undefined),
    saveProfileMediaAssociation: jest.fn(async () => []),
    saveProfileRoles: jest.fn(async () => undefined),
    uploadStagedProfileMedia: jest.fn(
      async ({
        staged,
      }: {
        staged: import('@/features/profile/edit/model/profile-edit-model').ProfileEditStagedMedia;
      }) => ({
        ...staged,
        failure: null,
        status: 'uploaded' as const,
        uploadedAssetId: `${staged.slot}-uploaded`,
        uploadedObjectKey: `owner/${staged.slot}-uploaded.jpg`,
      }),
    ),
    withUploadedMedia: jest.fn(
      (
        form: import('@/features/profile/edit/model/profile-edit-model').ProfileEditForm,
        item: import('@/features/profile/edit/model/profile-edit-model').ProfileEditStagedMedia,
      ) => {
        const media = {
          ...form.media,
          staged: { ...form.media.staged, [item.slot]: item },
        };
        if (item.slot === 'avatar') {
          media.avatarMediaId = item.uploadedAssetId;
          media.avatarUrl = item.uploadedAssetId
            ? `https://media/${item.uploadedAssetId}`
            : undefined;
        } else {
          media.coverMediaId = item.uploadedAssetId;
          media.coverUrl = item.uploadedAssetId
            ? `https://media/${item.uploadedAssetId}`
            : undefined;
        }
        return { ...form, media };
      },
    ),
  };
});

const mockClearMedia = jest.mocked(clearProfileMediaDraftItem);
const mockPersistMedia = jest.mocked(persistProfileMediaDraftItem);
const mockSaveGameProfile = jest.mocked(saveProfileGameProfile);
const mockSaveHabits = jest.mocked(saveProfileHabits);
const mockSaveHeroes = jest.mocked(saveProfileHeroes);
const mockSaveIdentity = jest.mocked(saveProfileIdentity);
const mockSaveMediaAssociation = jest.mocked(saveProfileMediaAssociation);
const mockSaveRoles = jest.mocked(saveProfileRoles);
const mockUploadMedia = jest.mocked(uploadStagedProfileMedia);
const mockWithUploadedMedia = jest.mocked(withUploadedMedia);

const session: AuthSession = {
  accessToken: 'access',
  expiresAt: 4102444800,
  refreshToken: 'refresh',
  tokenType: 'bearer',
  user: {
    email: 'profile@example.com',
    id: '00000000-0000-0000-0000-000000000001',
    user_metadata: {},
  },
};

beforeEach(() => {
  for (const mock of [
    mockClearMedia,
    mockPersistMedia,
    mockSaveGameProfile,
    mockSaveHabits,
    mockSaveHeroes,
    mockSaveIdentity,
    mockSaveMediaAssociation,
    mockSaveRoles,
    mockUploadMedia,
    mockWithUploadedMedia,
  ]) {
    mock.mockClear();
  }
  mockPersistMedia.mockImplementation(async (_profileId, item) => item);
  mockSaveIdentity.mockResolvedValue(undefined);
  mockSaveGameProfile.mockResolvedValue(undefined);
  mockSaveRoles.mockResolvedValue(undefined);
  mockSaveHeroes.mockResolvedValue(undefined);
  mockSaveHabits.mockResolvedValue(undefined);
  mockSaveMediaAssociation.mockResolvedValue([]);
});

describe('saveProfileEditChanges', () => {
  it('saves only the section that changed', async () => {
    const baseline = baseForm();
    const current = clone(baseline);
    current.identity.displayName = 'New name';

    const result = await saveProfileEditChanges({
      baseline,
      current,
      draft: draftFor(baseline),
      session,
    });

    expect(result.outcome).toBe('saved');
    expect(result.savedSections).toEqual(['identity']);
    expect(mockSaveIdentity).toHaveBeenCalledTimes(1);
    expect(mockSaveGameProfile).not.toHaveBeenCalled();
    expect(mockSaveRoles).not.toHaveBeenCalled();
    expect(mockSaveHeroes).not.toHaveBeenCalled();
    expect(mockSaveHabits).not.toHaveBeenCalled();
  });

  it('stops after failure and advances baseline only for sections already saved', async () => {
    const baseline = baseForm();
    const current = clone(baseline);
    current.identity.displayName = 'Saved name';
    current.laneSelection = { primary: 'mid', secondary: 'support' };
    current.habits.seriousnessId = 'seriousness.competitive';
    mockSaveRoles.mockRejectedValueOnce(
      new ProfileEditCommandError('lane failed'),
    );

    const result = await saveProfileEditChanges({
      baseline,
      current,
      draft: draftFor(baseline),
      session,
    });

    expect(result.outcome).toBe('partially-saved');
    expect(result.savedSections).toEqual(['identity']);
    expect(result.failedSection).toBe('lanes');
    expect(result.retrySections).toEqual(['lanes', 'habits']);
    expect(result.baseline.identity.displayName).toBe('Saved name');
    expect(result.baseline.laneSelection).toEqual(baseline.laneSelection);
    expect(mockSaveHabits).not.toHaveBeenCalled();
  });

  it('tracks avatar as associated while preserving cover for retry', async () => {
    const baseline = baseForm();
    baseline.media.avatarMediaId = 'avatar-old';
    baseline.media.coverMediaId = 'cover-old';
    const current = clone(baseline);
    current.media.avatarMediaId = 'avatar-new';
    current.media.coverMediaId = 'cover-new';
    current.media.staged.avatar = uploadedItem('avatar', 'avatar-new');
    current.media.staged.cover = uploadedItem('cover', 'cover-new');
    mockSaveMediaAssociation.mockRejectedValueOnce(
      new ProfileEditCommandError('cover failed', {
        associatedMediaSlots: ['avatar'],
        partiallySaved: true,
      }),
    );

    const result = await saveProfileEditChanges({
      baseline,
      current,
      draft: draftFor(baseline),
      session,
    });

    expect(result.outcome).toBe('partially-saved');
    expect(result.failedSection).toBe('media');
    expect(result.form.media.staged.avatar?.status).toBe('associated');
    expect(result.form.media.staged.cover?.status).toBe('uploaded');
    expect(result.uploadedButUnassociated.map((item) => item.slot)).toEqual([
      'cover',
    ]);
    expect(result.baseline.media.avatarMediaId).toBe('avatar-new');
    expect(result.baseline.media.coverMediaId).toBe('cover-old');
    expect(mockClearMedia).toHaveBeenCalledWith(session.user.id, 'avatar');
  });

  it('retries an uploaded asset without uploading it again', async () => {
    const baseline = baseForm();
    baseline.media.coverMediaId = 'cover-old';
    const current = clone(baseline);
    current.media.coverMediaId = 'cover-uploaded';
    current.media.staged.cover = uploadedItem('cover', 'cover-uploaded');
    mockSaveMediaAssociation.mockResolvedValueOnce(['cover']);

    const result = await saveProfileEditChanges({
      baseline,
      current,
      draft: draftFor(baseline),
      onlySections: ['media'],
      session,
    });

    expect(result.outcome).toBe('saved');
    expect(mockUploadMedia).not.toHaveBeenCalled();
    expect(mockPersistMedia).toHaveBeenCalledWith(
      session.user.id,
      expect.objectContaining({ uploadedAssetId: 'cover-uploaded' }),
    );
    expect(mockClearMedia).toHaveBeenCalledWith(session.user.id, 'cover');
  });

  it('does not write availability before the shared primitive exists', async () => {
    const baseline = baseForm();
    const current = clone(baseline);
    current.availability = {
      slots: [{ dayOfWeek: 1, startMinute: 1080, endMinute: 1440 }],
      timezone: 'Asia/Bangkok',
    };

    const result = await saveProfileEditChanges({
      baseline,
      current,
      draft: draftFor(baseline),
      session,
    });

    expect(result.outcome).toBe('failed');
    expect(result.failedSection).toBe('availability');
    expect(result.steps.find((step) => step.id === 'availability')).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('primitive dùng chung'),
        status: 'failed',
      }),
    );
    expect(mockSaveHabits).not.toHaveBeenCalled();
  });
});

function baseForm(): ProfileEditForm {
  const form = makeProfileEditForm();
  form.identity.displayName = 'Old name';
  return form;
}

function draftFor(form: ProfileEditForm): ProfileEditDraft {
  return makeProfileEditDraft(form, session.user.id);
}

function uploadedItem(
  slot: 'avatar' | 'cover',
  assetId: string,
): ProfileEditStagedMedia {
  return makeProfileMediaItem({ assetId, slot, status: 'uploaded' });
}
