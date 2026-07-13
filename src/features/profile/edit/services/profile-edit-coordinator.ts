import type { AuthSession } from '@/shared/auth/auth-service';

import {
  applySavedProfileEditSections,
  cloneProfileEditForm,
  getDirtyProfileEditSections,
  type ProfileEditDraft,
  type ProfileEditForm,
  type ProfileEditMediaSlot,
  type ProfileEditSectionId,
  type ProfileEditStagedMedia,
} from '../model/profile-edit-model';
import {
  clearProfileMediaDraftItem,
  persistProfileMediaDraftItem,
} from '../model/profile-media-picker-recovery';
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
} from './profile-edit-commands';

export type ProfileEditSaveOutcome = 'saved' | 'partially-saved' | 'failed';
export type ProfileEditSaveStepStatus =
  'pending' | 'running' | 'saved' | 'partially-saved' | 'failed' | 'skipped';

export type ProfileEditSaveStep = {
  error?: string;
  id: ProfileEditSectionId;
  status: ProfileEditSaveStepStatus;
};

export type ProfileEditSaveResult = {
  baseline: ProfileEditForm;
  failedSection?: ProfileEditSectionId;
  form: ProfileEditForm;
  outcome: ProfileEditSaveOutcome;
  retrySections: ProfileEditSectionId[];
  savedSections: ProfileEditSectionId[];
  steps: ProfileEditSaveStep[];
  uploadedButUnassociated: ProfileEditStagedMedia[];
};

const saveOrder: readonly ProfileEditSectionId[] = [
  'identity',
  'gameProfile',
  'lanes',
  'heroes',
  'habits',
  'availability',
  'media',
];

class ProfileMediaPreparationError extends ProfileEditCommandError {
  readonly form: ProfileEditForm;
  readonly uploadedButUnassociated: readonly ProfileEditStagedMedia[];

  constructor(input: {
    cause: unknown;
    form: ProfileEditForm;
    message: string;
    uploadedButUnassociated: readonly ProfileEditStagedMedia[];
  }) {
    super(input.message, {
      cause: input.cause,
      partiallySaved: input.uploadedButUnassociated.length > 0,
    });
    this.name = 'ProfileMediaPreparationError';
    this.form = input.form;
    this.uploadedButUnassociated = input.uploadedButUnassociated;
  }
}

export async function saveProfileEditChanges(input: {
  baseline: ProfileEditForm;
  current: ProfileEditForm;
  draft: ProfileEditDraft;
  onlySections?: readonly ProfileEditSectionId[];
  session: AuthSession;
}): Promise<ProfileEditSaveResult> {
  const dirty = new Set(
    input.onlySections ??
      getDirtyProfileEditSections(input.baseline, input.current),
  );
  const steps = saveOrder.map<ProfileEditSaveStep>((id) => ({
    id,
    status: dirty.has(id) ? 'pending' : 'skipped',
  }));
  const savedSections: ProfileEditSectionId[] = [];
  let workingForm = cloneProfileEditForm(input.current);
  let workingBaseline = cloneProfileEditForm(input.baseline);
  let uploadedButUnassociated: ProfileEditStagedMedia[] = [];

  for (const section of saveOrder) {
    if (!dirty.has(section)) continue;
    const step = findStep(steps, section);
    step.status = 'running';

    try {
      if (section === 'media') {
        const prepared = await prepareMediaForAssociation({
          draft: input.draft,
          form: workingForm,
          session: input.session,
        });
        workingForm = prepared.form;
        uploadedButUnassociated = prepared.uploadedButUnassociated;

        const commandAssociated = await saveProfileMediaAssociation({
          baseline: workingBaseline.media,
          current: workingForm.media,
          hasHabitRecord: input.draft.meta.hasHabitRecord,
          profileId: input.draft.id,
          session: input.session,
        });
        const associatedSlots = uniqueSlots([
          ...commandAssociated,
          ...alreadyAssociatedStagedSlots(workingBaseline, workingForm),
        ]);
        workingForm = markMediaSlotsAssociated(workingForm, associatedSlots);
        uploadedButUnassociated = uploadedButUnassociated.filter(
          (item) => !associatedSlots.includes(item.slot),
        );
        await clearRecoveredMediaSlots(input.draft.id, associatedSlots);
      } else {
        await saveNonMediaSection({
          baseline: workingBaseline,
          current: workingForm,
          draft: input.draft,
          section,
          session: input.session,
        });
      }

      step.status = 'saved';
      savedSections.push(section);
      workingBaseline = applySavedProfileEditSections(
        workingBaseline,
        workingForm,
        [section],
      );
    } catch (error) {
      if (error instanceof ProfileMediaPreparationError) {
        workingForm = error.form;
        uploadedButUnassociated = [...error.uploadedButUnassociated];
      }

      const associatedSlots =
        error instanceof ProfileEditCommandError
          ? [...error.associatedMediaSlots]
          : [];
      if (section === 'media' && associatedSlots.length) {
        workingForm = markMediaSlotsAssociated(workingForm, associatedSlots);
        workingBaseline = applyAssociatedMediaToBaseline(
          workingBaseline,
          workingForm,
          associatedSlots,
        );
        uploadedButUnassociated = uploadedButUnassociated.filter(
          (item) => !associatedSlots.includes(item.slot),
        );
        await clearRecoveredMediaSlots(input.draft.id, associatedSlots);
      }

      workingForm = markUploadingMediaFailed(workingForm, errorMessage(error));
      await persistRecoverableMedia(input.draft.id, workingForm);

      const commandPartial =
        error instanceof ProfileEditCommandError && error.partiallySaved;
      const partiallySaved =
        commandPartial ||
        uploadedButUnassociated.length > 0 ||
        savedSections.length > 0;
      step.status = partiallySaved ? 'partially-saved' : 'failed';
      step.error = errorMessage(error);
      return buildFailureResult({
        baseline: workingBaseline,
        failedSection: section,
        form: workingForm,
        partiallySaved,
        savedSections,
        steps,
        uploadedButUnassociated,
      });
    }
  }

  return {
    baseline: workingBaseline,
    form: workingForm,
    outcome: 'saved',
    retrySections: [],
    savedSections,
    steps,
    uploadedButUnassociated: [],
  };
}

async function prepareMediaForAssociation(input: {
  draft: ProfileEditDraft;
  form: ProfileEditForm;
  session: AuthSession;
}) {
  const stagedCover = input.form.media.staged.cover;
  if (stagedCover && !input.draft.meta.hasHabitRecord) {
    throw new ProfileEditCommandError(
      'Chưa có profile_habits để liên kết ảnh nền. Ảnh chưa được upload.',
    );
  }

  let form = cloneProfileEditForm(input.form);
  const uploadedButUnassociated: ProfileEditStagedMedia[] = [];
  for (const slot of ['avatar', 'cover'] as const) {
    const staged = form.media.staged[slot];
    if (!staged) continue;
    if (staged.status === 'failed' && !staged.uploadedAssetId) {
      throw new ProfileMediaPreparationError({
        cause: new Error(staged.error),
        form,
        message: staged.error ?? 'Ảnh đã chọn chưa vượt qua validation.',
        uploadedButUnassociated,
      });
    }
    if (staged.uploadedAssetId) {
      const persisted = await persistProfileMediaDraftItem(
        input.draft.id,
        staged,
      );
      uploadedButUnassociated.push(persisted);
      form = withUploadedMedia(form, persisted);
      continue;
    }

    const uploading: ProfileEditStagedMedia = {
      ...staged,
      error: undefined,
      status: 'uploading',
    };
    form = setStagedMedia(form, uploading);
    try {
      const uploaded = await uploadStagedProfileMedia({
        session: input.session,
        staged: uploading,
      });
      const persisted = await persistProfileMediaDraftItem(
        input.draft.id,
        uploaded,
      );
      uploadedButUnassociated.push(persisted);
      form = withUploadedMedia(form, persisted);
    } catch (error) {
      const failed: ProfileEditStagedMedia = {
        ...uploading,
        error: errorMessage(error),
        status: 'failed',
      };
      form = setStagedMedia(form, failed);
      await persistProfileMediaDraftItem(input.draft.id, failed).catch(
        () => undefined,
      );
      throw new ProfileMediaPreparationError({
        cause: error,
        form,
        message: errorMessage(error),
        uploadedButUnassociated,
      });
    }
  }
  return { form, uploadedButUnassociated };
}

async function saveNonMediaSection(input: {
  baseline: ProfileEditForm;
  current: ProfileEditForm;
  draft: ProfileEditDraft;
  section: Exclude<ProfileEditSectionId, 'media'>;
  session: AuthSession;
}) {
  const shared = { profileId: input.draft.id, session: input.session };
  if (input.section === 'identity') {
    return saveProfileIdentity({
      ...shared,
      baseline: input.baseline.identity,
      current: input.current.identity,
    });
  }
  if (input.section === 'gameProfile') {
    return saveProfileGameProfile({
      ...shared,
      baseline: input.baseline.gameProfile,
      current: input.current.gameProfile,
      hasGameProfileRecord: input.draft.meta.hasGameProfileRecord,
      rankDbIds: input.draft.meta.rankDbIds,
    });
  }
  if (input.section === 'lanes') {
    return saveProfileRoles({
      ...shared,
      baselineSelection: input.baseline.laneSelection,
      currentSelection: input.current.laneSelection,
      laneDbIds: input.draft.meta.laneDbIds,
      lanesLossless: input.draft.meta.lanesLossless,
    });
  }
  if (input.section === 'heroes') {
    return saveProfileHeroes({
      ...shared,
      baselineHeroes: input.baseline.heroes,
      currentHeroes: input.current.heroes,
      hasHabitRecord: input.draft.meta.hasHabitRecord,
      heroDbIds: input.draft.meta.heroDbIds,
      heroesLossless: input.draft.meta.heroesLossless,
    });
  }
  if (input.section === 'habits') {
    return saveProfileHabits({
      ...shared,
      baseline: input.baseline.habits,
      current: input.current.habits,
      habitsLossless: input.draft.meta.habitsLossless,
      hasHabitRecord: input.draft.meta.hasHabitRecord,
    });
  }
  throw new ProfileEditCommandError(
    'Availability đang chờ primitive dùng chung. Không có dữ liệu nào được ghi bằng adapter tạm.',
  );
}

function buildFailureResult(input: {
  baseline: ProfileEditForm;
  failedSection: ProfileEditSectionId;
  form: ProfileEditForm;
  partiallySaved: boolean;
  savedSections: ProfileEditSectionId[];
  steps: ProfileEditSaveStep[];
  uploadedButUnassociated: ProfileEditStagedMedia[];
}): ProfileEditSaveResult {
  const failedIndex = saveOrder.indexOf(input.failedSection);
  const retrySections = saveOrder.filter((section, index) => {
    if (index < failedIndex) return false;
    const step = findStep(input.steps, section);
    return step.status !== 'skipped';
  });
  for (const step of input.steps) {
    if (step.status === 'pending' || step.status === 'running') {
      step.status = 'skipped';
    }
  }
  return {
    baseline: input.baseline,
    failedSection: input.failedSection,
    form: input.form,
    outcome: input.partiallySaved ? 'partially-saved' : 'failed',
    retrySections,
    savedSections: input.savedSections,
    steps: input.steps,
    uploadedButUnassociated: input.uploadedButUnassociated,
  };
}

function markMediaSlotsAssociated(
  form: ProfileEditForm,
  slots: readonly ProfileEditMediaSlot[],
): ProfileEditForm {
  const next = cloneProfileEditForm(form);
  for (const slot of slots) {
    const item = next.media.staged[slot];
    if (item) {
      next.media.staged[slot] = {
        ...item,
        error: undefined,
        status: 'associated',
      };
    }
  }
  return next;
}

function applyAssociatedMediaToBaseline(
  baseline: ProfileEditForm,
  current: ProfileEditForm,
  slots: readonly ProfileEditMediaSlot[],
) {
  const next = cloneProfileEditForm(baseline);
  for (const slot of slots) {
    if (slot === 'avatar') {
      next.media.avatarMediaId = current.media.avatarMediaId;
      next.media.avatarUrl = current.media.avatarUrl;
    } else {
      next.media.coverMediaId = current.media.coverMediaId;
      next.media.coverUrl = current.media.coverUrl;
    }
    next.media.staged[slot] = current.media.staged[slot]
      ? { ...current.media.staged[slot]!, status: 'associated' }
      : undefined;
  }
  return next;
}

function markUploadingMediaFailed(form: ProfileEditForm, error: string) {
  const next = cloneProfileEditForm(form);
  for (const slot of ['avatar', 'cover'] as const) {
    const item = next.media.staged[slot];
    if (item?.status === 'uploading') {
      next.media.staged[slot] = { ...item, error, status: 'failed' };
    }
  }
  return next;
}

function setStagedMedia(
  form: ProfileEditForm,
  item: ProfileEditStagedMedia,
): ProfileEditForm {
  const next = cloneProfileEditForm(form);
  next.media.staged[item.slot] = item;
  return next;
}

function alreadyAssociatedStagedSlots(
  baseline: ProfileEditForm,
  current: ProfileEditForm,
) {
  return (['avatar', 'cover'] as const).filter((slot) => {
    const item = current.media.staged[slot];
    if (!item?.uploadedAssetId) return false;
    const baselineId =
      slot === 'avatar'
        ? baseline.media.avatarMediaId
        : baseline.media.coverMediaId;
    return baselineId === item.uploadedAssetId;
  });
}

async function persistRecoverableMedia(
  profileId: string,
  form: ProfileEditForm,
) {
  for (const slot of ['avatar', 'cover'] as const) {
    const item = form.media.staged[slot];
    if (!item || item.status === 'associated') continue;
    await persistProfileMediaDraftItem(profileId, item).catch(() => undefined);
  }
}

async function clearRecoveredMediaSlots(
  profileId: string,
  slots: readonly ProfileEditMediaSlot[],
) {
  for (const slot of slots) {
    await clearProfileMediaDraftItem(profileId, slot).catch(() => undefined);
  }
}

function uniqueSlots(slots: readonly ProfileEditMediaSlot[]) {
  return [...new Set(slots)];
}

function findStep(steps: ProfileEditSaveStep[], id: ProfileEditSectionId) {
  const step = steps.find((item) => item.id === id);
  if (!step) throw new Error(`Missing Profile edit step: ${id}`);
  return step;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Không thể lưu thay đổi.';
}
