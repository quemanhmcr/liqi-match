import type {
  SimulationJsonValue,
  SimulationResetParticipant,
} from '@/shared/simulation';

import {
  getPersistedOnboardingDraft,
  hydratePersistedOnboardingDraft,
  resetPersistedOnboardingDraft,
  updatePersistedOnboardingDraft,
  type OnboardingDraftEnvelope,
} from '../model/persisted-onboarding-draft';

type OnboardingDraft = OnboardingDraftEnvelope;

export type OnboardingDraftPort = {
  clear(accountId: string): Promise<void>;
  load(accountId: string): Promise<OnboardingDraft | null>;
  save(accountId: string, draft: OnboardingDraft): Promise<void>;
};

const defaultOnboardingDraftPort: OnboardingDraftPort = {
  clear: resetPersistedOnboardingDraft,
  async load(accountId) {
    await hydratePersistedOnboardingDraft(accountId);
    return getPersistedOnboardingDraft();
  },
  async save(accountId, draft) {
    await hydratePersistedOnboardingDraft(accountId);
    await updatePersistedOnboardingDraft(() => draft);
  },
};

export function createOnboardingSimulationResetParticipant(
  accountId: string,
  port: OnboardingDraftPort = defaultOnboardingDraftPort,
): SimulationResetParticipant<SimulationJsonValue> {
  const normalizedAccountId = requiredId(accountId, 'account id');
  return {
    key: `onboarding.draft:${normalizedAccountId}`,
    order: -160,
    reset: () => port.clear(normalizedAccountId),
    restore: async (state) => {
      await port.clear(normalizedAccountId);
      if (state === null) return;
      await port.save(normalizedAccountId, state as OnboardingDraft);
    },
    snapshot: async () =>
      jsonSnapshot(await port.load(normalizedAccountId)) as SimulationJsonValue,
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
