import {
  MediaStagingItemSchema,
  createEmptyHabitAnswers,
} from '@/entities/player-profile';
import { PlayerIdSchema, ProfileIdSchema } from '@/shared/contracts/core-v1';
import type {
  ProfileEditDraft,
  ProfileEditForm,
} from '@/features/profile/edit/model/profile-edit-model';

export function makeProfileEditForm(): ProfileEditForm {
  return {
    availability: null,
    gameProfile: { handle: 'GameHandle', rankId: 'master' },
    habits: {
      ...createEmptyHabitAnswers(),
      communicationPreferenceIds: ['communication.voice-as-needed'],
      seriousnessId: 'seriousness.balanced',
      teamGoalIds: ['goal.rank-climb'],
    },
    heroes: [
      { heroId: 'edras', priority: 1 },
      { heroId: 'goverra', priority: 2 },
      { heroId: 'heino', priority: 3 },
    ],
    identity: {
      bio: 'Bio',
      displayName: 'Display Name',
      genderId: null,
    },
    laneSelection: { primary: 'jungle', secondary: 'support' },
    media: {
      avatarMediaId: 'avatar-1',
      coverMediaId: 'cover-1',
      staged: {},
    },
  };
}

export function makeProfileEditDraft(
  form: ProfileEditForm = makeProfileEditForm(),
  profileId = '00000000-0000-0000-0000-000000000001',
): ProfileEditDraft {
  return {
    form: clone(form),
    id: profileId,
    mediaSummary: {},
    meta: {
      canonicalProfileId: ProfileIdSchema.parse(
        '30000000-0000-4000-8000-000000000701',
      ),
      habitIssues: [],
      habitsLossless: true,
      hasGameProfileRecord: true,
      hasHabitRecord: true,
      heroDbIds: {
        edras: 'hero-db-edras',
        goverra: 'hero-db-goverra',
        heino: 'hero-db-heino',
      },
      heroesLossless: true,
      laneDbIds: {
        jungle: 'role-db-jungle',
        mid: 'role-db-mid',
        support: 'role-db-support',
      },
      lanesLossless: true,
      playerId: PlayerIdSchema.parse('20000000-0000-4000-8000-000000000701'),
      profileVersion: 2,
      rankDbIds: { master: 'rank-db-master' },
      readIssues: [],
      serverRegion: 'sea',
    },
  };
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function makeProfileMediaItem(input: {
  assetId?: string;
  failureMessage?: string;
  localId?: string;
  slot: 'avatar' | 'cover';
  status?: import('@/entities/player-profile').MediaStagingStatus;
  uri?: string;
}): import('@/features/profile/edit/model/profile-edit-model').ProfileEditStagedMedia {
  const status = input.status ?? 'ready';
  const attempted =
    status === 'uploading' ||
    status === 'uploaded' ||
    status === 'associated' ||
    status === 'failed';
  const assetId = input.assetId ?? null;
  const item = {
    asset: {
      fileName: `${input.slot}.jpg`,
      fileSize: 1024,
      height: 512,
      mimeType: 'image/jpeg',
      uri:
        input.uri ?? `file:///documents/profile-edit-media/${input.slot}.jpg`,
      width: 512,
    },
    cleanup: {
      completedAt: null,
      failure: null,
      lastAttemptAt: null,
      requestedAt: null,
    },
    failure:
      status === 'failed'
        ? {
            code: 'test_media_failure',
            message: input.failureMessage ?? 'Media operation failed.',
          }
        : null,
    localId: input.localId ?? `${input.slot}:0:test-local`,
    persistedAt: '2026-07-13T02:00:00.000Z',
    position: 0,
    retry: {
      attemptCount: attempted ? 1 : 0,
      lastAttemptAt: attempted ? '2026-07-13T02:01:00.000Z' : null,
      retryable: true,
    },
    slot: input.slot,
    status,
    uploadedAssetId: assetId,
    uploadedObjectKey: assetId ? `owner/${assetId}.jpg` : null,
  };
  return MediaStagingItemSchema.parse(
    item,
  ) as import('@/features/profile/edit/model/profile-edit-model').ProfileEditStagedMedia;
}
