import {
  getPersistedOnboardingDraft,
  updatePersistedOnboardingDraft,
} from './persisted-onboarding-draft';
import {
  sortOnboardingMediaQueue,
  type OnboardingMediaQueueItem,
  type OnboardingMediaSlot,
  type PendingMediaSelection,
} from './onboarding-media-state';

export type {
  OnboardingMediaQueueItem,
  OnboardingMediaSlot,
  OnboardingMediaStatus,
  PendingMediaSelection,
} from './onboarding-media-state';
export {
  isOnboardingMediaItem,
  isPendingMediaSelection,
  sanitizeOnboardingMediaItem,
  sortOnboardingMediaQueue,
} from './onboarding-media-state';

let mediaIdSequence = 0;

export function getOnboardingMediaQueue() {
  return getPersistedOnboardingDraft().data.mediaQueue ?? [];
}

export async function replaceOnboardingMediaSlotItem(
  item: OnboardingMediaQueueItem,
) {
  return updatePersistedOnboardingDraft((current) => {
    const mediaQueue = (current.data.mediaQueue ?? []).filter(
      (candidate) =>
        candidate.slot !== item.slot || candidate.position !== item.position,
    );
    mediaQueue.push(item);

    return {
      ...current,
      data: {
        ...current.data,
        mediaQueue: sortOnboardingMediaQueue(mediaQueue),
        pendingMediaSelection: undefined,
      },
      status: current.status === 'not_started' ? 'in_progress' : current.status,
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function setPendingOnboardingMediaSelection(
  selection: PendingMediaSelection | undefined,
) {
  return updatePersistedOnboardingDraft((current) => ({
    ...current,
    data: { ...current.data, pendingMediaSelection: selection },
    updatedAt: new Date().toISOString(),
  }));
}

export async function updateOnboardingMediaItem(
  item: OnboardingMediaQueueItem,
) {
  return updatePersistedOnboardingDraft((current) => {
    const mediaQueue = [...(current.data.mediaQueue ?? [])];
    const index = mediaQueue.findIndex(
      (candidate) => candidate.localId === item.localId,
    );
    if (index >= 0) mediaQueue[index] = item;
    else mediaQueue.push(item);

    return {
      ...current,
      data: {
        ...current.data,
        mediaQueue: sortOnboardingMediaQueue(mediaQueue),
      },
      status: current.status === 'not_started' ? 'in_progress' : current.status,
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function removeOnboardingMediaItem(localId: string) {
  return updatePersistedOnboardingDraft((current) => ({
    ...current,
    data: {
      ...current.data,
      mediaQueue: (current.data.mediaQueue ?? []).filter(
        (item) => item.localId !== localId,
      ),
    },
    updatedAt: new Date().toISOString(),
  }));
}

export async function recoverInterruptedOnboardingMediaQueue() {
  const interrupted = getOnboardingMediaQueue().filter(
    (item) => item.status === 'uploading',
  );
  if (!interrupted.length) return getPersistedOnboardingDraft();

  return updatePersistedOnboardingDraft((current) => ({
    ...current,
    data: {
      ...current.data,
      mediaQueue: (current.data.mediaQueue ?? []).map((item) =>
        item.status === 'uploading'
          ? {
              ...item,
              error:
                'Upload bị gián đoạn khi ứng dụng đóng. Hãy thử lại mục này.',
              status: 'error' as const,
            }
          : item,
      ),
    },
    updatedAt: new Date().toISOString(),
  }));
}

export function createOnboardingMediaLocalId(
  slot: OnboardingMediaSlot,
  position: number,
) {
  mediaIdSequence += 1;
  return `${slot}:${position}:${Date.now().toString(36)}:${mediaIdSequence.toString(36)}`;
}
