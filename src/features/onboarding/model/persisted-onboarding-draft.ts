import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { HabitPayload } from '../habit-options';

export const ONBOARDING_DRAFT_VERSION = 1;

export type OnboardingStatus =
  'not_started' | 'in_progress' | 'media_pending' | 'completed';

export type OnboardingStep =
  | 'profile_setup'
  | 'rank'
  | 'lane'
  | 'hero_selection'
  | 'habits'
  | 'profile_media';

export type OnboardingDraftData = {
  habits?: HabitPayload;
  heroIds?: string[];
  laneIds?: string[];
  profileBasics?: {
    displayName?: string;
    gender?: 'male' | 'female' | 'hidden';
  };
  rankId?: string;
};

export type OnboardingDraftEnvelope = {
  accountId: string;
  currentStep: OnboardingStep;
  data: OnboardingDraftData;
  status: OnboardingStatus;
  updatedAt: string;
  version: typeof ONBOARDING_DRAFT_VERSION;
};

export type OnboardingDraftHydration = 'idle' | 'hydrating' | 'ready' | 'error';

type DraftSource = 'empty' | 'persisted';

type PersistedOnboardingDraftState = {
  accountId: string | null;
  envelope: OnboardingDraftEnvelope | null;
  hydration: OnboardingDraftHydration;
  hydrationError: string | null;
  persistenceError: string | null;
  source: DraftSource;
};

const initialState: PersistedOnboardingDraftState = {
  accountId: null,
  envelope: null,
  hydration: 'idle',
  hydrationError: null,
  persistenceError: null,
  source: 'empty',
};

export const usePersistedOnboardingDraftStore =
  create<PersistedOnboardingDraftState>(() => ({ ...initialState }));

let hydrationGeneration = 0;
let operationQueue: Promise<unknown> = Promise.resolve();

export function onboardingDraftStorageKey(accountId: string) {
  return `@liqi/onboarding-draft/v${ONBOARDING_DRAFT_VERSION}/${encodeURIComponent(accountId)}`;
}

export function createEmptyOnboardingDraft(
  accountId: string,
): OnboardingDraftEnvelope {
  return {
    accountId,
    currentStep: 'profile_setup',
    data: {},
    status: 'not_started',
    updatedAt: nowIso(),
    version: ONBOARDING_DRAFT_VERSION,
  };
}

export async function hydratePersistedOnboardingDraft(accountId: string) {
  const generation = ++hydrationGeneration;
  usePersistedOnboardingDraftStore.setState({
    accountId,
    envelope: null,
    hydration: 'hydrating',
    hydrationError: null,
    persistenceError: null,
    source: 'empty',
  });

  try {
    await operationQueue.catch(() => undefined);
    const raw = await AsyncStorage.getItem(
      onboardingDraftStorageKey(accountId),
    );
    if (generation !== hydrationGeneration) return;

    const envelope = raw
      ? migrateOnboardingDraft(JSON.parse(raw), accountId)
      : createEmptyOnboardingDraft(accountId);

    usePersistedOnboardingDraftStore.setState({
      accountId,
      envelope,
      hydration: 'ready',
      hydrationError: null,
      persistenceError: null,
      source: raw ? 'persisted' : 'empty',
    });
  } catch (error) {
    if (generation !== hydrationGeneration) return;
    usePersistedOnboardingDraftStore.setState({
      accountId,
      envelope: null,
      hydration: 'error',
      hydrationError: errorMessage(
        error,
        'Không thể khôi phục tiến độ onboarding.',
      ),
      persistenceError: null,
      source: 'empty',
    });
  }
}

export function clearActivePersistedOnboardingDraft() {
  hydrationGeneration += 1;
  usePersistedOnboardingDraftStore.setState({ ...initialState });
}

export async function resetPersistedOnboardingDraft(accountId: string) {
  return enqueueOperation(async () => {
    await AsyncStorage.removeItem(onboardingDraftStorageKey(accountId));

    const state = usePersistedOnboardingDraftStore.getState();
    if (state.accountId !== accountId) return;

    usePersistedOnboardingDraftStore.setState({
      accountId,
      envelope: createEmptyOnboardingDraft(accountId),
      hydration: 'ready',
      hydrationError: null,
      persistenceError: null,
      source: 'empty',
    });
  });
}

export function getPersistedOnboardingDraft() {
  return requireReadyEnvelope();
}

export async function updatePersistedOnboardingDraft(
  update: (current: OnboardingDraftEnvelope) => OnboardingDraftEnvelope,
): Promise<OnboardingDraftEnvelope> {
  return enqueueOperation(async () => {
    const current = requireReadyEnvelope();
    const next = normalizeEnvelope(update(current), current.accountId);

    try {
      await AsyncStorage.setItem(
        onboardingDraftStorageKey(next.accountId),
        JSON.stringify(next),
      );
    } catch (error) {
      const state = usePersistedOnboardingDraftStore.getState();
      if (state.accountId === current.accountId) {
        usePersistedOnboardingDraftStore.setState({
          persistenceError: errorMessage(
            error,
            'Không thể lưu tiến độ onboarding.',
          ),
        });
      }
      throw error;
    }

    const state = usePersistedOnboardingDraftStore.getState();
    if (state.accountId === next.accountId) {
      usePersistedOnboardingDraftStore.setState({
        envelope: next,
        persistenceError: null,
        source: 'persisted',
      });
    }

    return next;
  });
}

export async function patchPersistedOnboardingDraftData(
  patch: Partial<OnboardingDraftData>,
) {
  return updatePersistedOnboardingDraft((current) => ({
    ...current,
    data: { ...current.data, ...patch },
    updatedAt: nowIso(),
  }));
}

/**
 * Versioned deserialization boundary. Future schema owners can add migrations
 * here without changing account isolation, hydration, or write serialization.
 */
export function migrateOnboardingDraft(
  raw: unknown,
  accountId: string,
): OnboardingDraftEnvelope {
  if (!isRecord(raw)) throw new Error('Draft onboarding không đúng định dạng.');
  if (raw.version !== ONBOARDING_DRAFT_VERSION) {
    throw new Error(
      `Chưa hỗ trợ draft onboarding phiên bản ${String(raw.version)}.`,
    );
  }

  return normalizeEnvelope(raw, accountId);
}

function normalizeEnvelope(
  raw: unknown,
  accountId: string,
): OnboardingDraftEnvelope {
  if (!isRecord(raw)) throw new Error('Draft onboarding không đúng định dạng.');
  if (raw.accountId !== accountId) {
    throw new Error('Draft onboarding không thuộc tài khoản hiện tại.');
  }

  return {
    accountId,
    currentStep: onboardingStep(raw.currentStep),
    data: sanitizeDraftData(raw.data),
    status: onboardingStatus(raw.status),
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt
        ? raw.updatedAt
        : nowIso(),
    version: ONBOARDING_DRAFT_VERSION,
  };
}

function requireReadyEnvelope() {
  const state = usePersistedOnboardingDraftStore.getState();
  if (state.hydration !== 'ready' || !state.envelope || !state.accountId) {
    throw new Error('Draft onboarding chưa hydrate cho tài khoản hiện tại.');
  }
  if (state.envelope.accountId !== state.accountId) {
    throw new Error('Draft onboarding không khớp tài khoản hiện tại.');
  }
  return state.envelope;
}

function enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = operationQueue.catch(() => undefined).then(operation);
  operationQueue = next;
  return next;
}

function sanitizeDraftData(value: unknown): OnboardingDraftData {
  if (!isRecord(value)) return {};
  const data: OnboardingDraftData = {};

  if (isRecord(value.profileBasics)) {
    const displayName = optionalString(value.profileBasics.displayName);
    const gender = profileGender(value.profileBasics.gender);
    if (displayName !== undefined || gender !== undefined) {
      data.profileBasics = { displayName, gender };
    }
  }
  if (typeof value.rankId === 'string' && value.rankId) {
    data.rankId = value.rankId;
  }
  if (isStringArray(value.laneIds)) data.laneIds = [...value.laneIds];
  if (isStringArray(value.heroIds)) data.heroIds = [...value.heroIds];
  if (isHabitPayload(value.habits)) data.habits = value.habits;

  return data;
}

function isHabitPayload(value: unknown): value is HabitPayload {
  if (!isRecord(value)) return false;
  return (
    isStringArray(value.communication_channels) &&
    isStringArray(value.online_time_presets) &&
    typeof value.decision_style === 'string' &&
    typeof value.session_length === 'string' &&
    isStringArray(value.team_goals) &&
    typeof value.seriousness === 'string' &&
    isStringArray(value.strategy_styles) &&
    isStringArray(value.team_atmospheres) &&
    typeof value.feedback_style === 'string' &&
    typeof value.loss_response === 'string' &&
    typeof value.comeback_response === 'string'
  );
}

function onboardingStatus(value: unknown): OnboardingStatus {
  if (
    value === 'not_started' ||
    value === 'in_progress' ||
    value === 'media_pending' ||
    value === 'completed'
  ) {
    return value;
  }
  throw new Error('Trạng thái draft onboarding không hợp lệ.');
}

function onboardingStep(value: unknown): OnboardingStep {
  if (
    value === 'profile_setup' ||
    value === 'rank' ||
    value === 'lane' ||
    value === 'hero_selection' ||
    value === 'habits' ||
    value === 'profile_media'
  ) {
    return value;
  }
  throw new Error('Bước onboarding không hợp lệ.');
}

function profileGender(value: unknown) {
  if (value === 'male' || value === 'female' || value === 'hidden')
    return value;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function nowIso() {
  return new Date().toISOString();
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
