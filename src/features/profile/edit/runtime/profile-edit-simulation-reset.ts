import type {
  SimulationJsonValue,
  SimulationResetParticipant,
} from '@/shared/simulation';

import {
  clearProfileMediaDraftRecord,
  replaceProfileMediaDraft,
  restoreProfileMediaDraft,
  type ProfileMediaDraftSnapshot,
} from '../model/profile-media-picker-recovery';

type ProfileMediaDraft = ProfileMediaDraftSnapshot;

export type ProfileEditRecoveryPort = {
  clear(profileId: string): Promise<void>;
  load(profileId: string): Promise<ProfileMediaDraft | null>;
  save(profileId: string, draft: ProfileMediaDraft): Promise<void>;
};

const defaultProfileEditRecoveryPort: ProfileEditRecoveryPort = {
  clear: clearProfileMediaDraftRecord,
  load: restoreProfileMediaDraft,
  save: replaceProfileMediaDraft,
};

export function createProfileEditSimulationResetParticipant(
  profileId: string,
  port: ProfileEditRecoveryPort = defaultProfileEditRecoveryPort,
): SimulationResetParticipant<SimulationJsonValue> {
  const normalizedProfileId = requiredId(profileId, 'profile id');
  return {
    key: `profile-edit.recovery:${normalizedProfileId}`,
    order: -150,
    reset: () => port.clear(normalizedProfileId),
    restore: async (state) => {
      await port.clear(normalizedProfileId);
      if (state === null) return;
      await port.save(normalizedProfileId, state as ProfileMediaDraft);
    },
    snapshot: async () =>
      jsonSnapshot(await port.load(normalizedProfileId)) as SimulationJsonValue,
  };
}

function jsonSnapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requiredId(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Simulation ${label} must be non-empty.`);
  return normalized;
}
