import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  GENDER_CATALOG,
  LANE_CATALOG,
  MediaStagingQueueSchema,
  OnboardingDraftSchema,
  PROFILE_LIMITS,
  RANK_CATALOG,
  TimezoneSchema,
  adaptLegacyHabitAnswers,
  buildRecurringAvailabilityFromTimePreferences,
  createEmptyOnboardingDraft as createEmptyProfileDraft,
  resolveCatalogId,
  resolveHeroId,
  type HeroId,
  type LegacyProfileAdapterIssue,
  type OnboardingDraft,
} from '@/entities/player-profile';

import {
  isPendingMediaSelection,
  migrateLegacyOnboardingMediaQueue,
  type OnboardingMediaQueueItem,
  type PendingMediaSelection,
} from './onboarding-media-state';

export const ONBOARDING_DRAFT_VERSION = 3 as const;
const PREVIOUS_ONBOARDING_DRAFT_VERSION = 2 as const;
const LEGACY_ONBOARDING_DRAFT_VERSION = 1 as const;

export type OnboardingStatus =
  'not_started' | 'in_progress' | 'media_pending' | 'completed';

export type OnboardingStep =
  | 'profile_setup'
  | 'rank'
  | 'lane'
  | 'hero_selection'
  | 'habits'
  | 'profile_media';

export type OnboardingDraftMigrationIssue = Readonly<{
  code:
    | 'legacy_availability_expanded_all_days'
    | 'legacy_completed_status_downgraded'
    | 'legacy_game_handle_missing'
    | 'legacy_media_staging_migrated'
    | 'legacy_value_invalid';
  message: string;
  path: string;
  severity: 'error' | 'warning';
}>;

export type OnboardingDraftData = {
  compatibilityWarnings?: LegacyProfileAdapterIssue[];
  completedAt?: string;
  coreProfileCompletedAt?: string;
  mediaQueue?: OnboardingMediaQueueItem[];
  pendingMediaSelection?: PendingMediaSelection;
  profile: OnboardingDraft;
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
  migrationIssues: OnboardingDraftMigrationIssue[];
  persistenceError: string | null;
  source: DraftSource;
};

const initialState: PersistedOnboardingDraftState = {
  accountId: null,
  envelope: null,
  hydration: 'idle',
  hydrationError: null,
  migrationIssues: [],
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

export function previousOnboardingDraftStorageKey(accountId: string) {
  return `@liqi/onboarding-draft/v${PREVIOUS_ONBOARDING_DRAFT_VERSION}/${encodeURIComponent(accountId)}`;
}

export function legacyOnboardingDraftStorageKey(accountId: string) {
  return `@liqi/onboarding-draft/v${LEGACY_ONBOARDING_DRAFT_VERSION}/${encodeURIComponent(accountId)}`;
}

export function createEmptyOnboardingDraft(
  accountId: string,
): OnboardingDraftEnvelope {
  return {
    accountId,
    currentStep: 'profile_setup',
    data: { profile: createEmptyProfileDraft() },
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
    migrationIssues: [],
    persistenceError: null,
    source: 'empty',
  });

  try {
    await operationQueue.catch(() => undefined);
    const currentKey = onboardingDraftStorageKey(accountId);
    const previousKey = previousOnboardingDraftStorageKey(accountId);
    const legacyKey = legacyOnboardingDraftStorageKey(accountId);
    const currentRaw = await AsyncStorage.getItem(currentKey);
    const previousRaw = currentRaw
      ? null
      : await AsyncStorage.getItem(previousKey);
    const legacyRaw =
      currentRaw || previousRaw ? null : await AsyncStorage.getItem(legacyKey);
    if (generation !== hydrationGeneration) return;

    if (!currentRaw && !previousRaw && !legacyRaw) {
      usePersistedOnboardingDraftStore.setState({
        accountId,
        envelope: createEmptyOnboardingDraft(accountId),
        hydration: 'ready',
        hydrationError: null,
        migrationIssues: [],
        persistenceError: null,
        source: 'empty',
      });
      return;
    }

    const parsedRaw = JSON.parse(currentRaw ?? previousRaw ?? legacyRaw!);
    const migrated = migrateOnboardingDraftWithIssues(parsedRaw, accountId);
    const requiresRewrite =
      previousRaw !== null ||
      legacyRaw !== null ||
      (isRecord(parsedRaw) && parsedRaw.version !== ONBOARDING_DRAFT_VERSION);

    if (requiresRewrite) {
      await AsyncStorage.setItem(currentKey, JSON.stringify(migrated.envelope));
    }
    if (previousRaw) {
      await AsyncStorage.removeItem(previousKey);
    }
    if (legacyRaw) {
      await AsyncStorage.removeItem(legacyKey);
    }
    if (generation !== hydrationGeneration) return;

    usePersistedOnboardingDraftStore.setState({
      accountId,
      envelope: migrated.envelope,
      hydration: 'ready',
      hydrationError: null,
      migrationIssues: migrated.issues,
      persistenceError: null,
      source: 'persisted',
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
      migrationIssues: [],
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
    await AsyncStorage.removeItem(previousOnboardingDraftStorageKey(accountId));
    await AsyncStorage.removeItem(legacyOnboardingDraftStorageKey(accountId));

    const state = usePersistedOnboardingDraftStore.getState();
    if (state.accountId !== accountId) return;

    usePersistedOnboardingDraftStore.setState({
      accountId,
      envelope: createEmptyOnboardingDraft(accountId),
      hydration: 'ready',
      hydrationError: null,
      migrationIssues: [],
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
  const expectedAccountId = requireReadyEnvelope().accountId;

  return enqueueOperation(async () => {
    const activeState = usePersistedOnboardingDraftStore.getState();
    if (activeState.accountId !== expectedAccountId) {
      throw new Error('Tài khoản đã thay đổi trước khi lưu draft onboarding.');
    }
    const current = requireReadyEnvelope();
    const next = normalizeCurrentEnvelope(update(current), current.accountId);

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

export async function markOnboardingCoreProfileCompleted(
  compatibilityWarnings: LegacyProfileAdapterIssue[],
) {
  return updatePersistedOnboardingDraft((current) => {
    const timestamp = nowIso();
    return {
      ...current,
      currentStep: 'profile_media',
      data: {
        ...current.data,
        compatibilityWarnings,
        coreProfileCompletedAt: timestamp,
      },
      status: 'media_pending',
      updatedAt: timestamp,
    };
  });
}

export async function markOnboardingCompleted() {
  return updatePersistedOnboardingDraft((current) => {
    const timestamp = nowIso();
    return {
      ...current,
      data: { ...current.data, completedAt: timestamp },
      status: 'completed',
      updatedAt: timestamp,
    };
  });
}

export async function savePersistedOnboardingStep(
  profilePatch: Partial<OnboardingDraft>,
  nextStep: OnboardingStep,
) {
  return updatePersistedOnboardingDraft((current) => ({
    ...current,
    currentStep: nextStep,
    data: {
      ...current.data,
      profile: OnboardingDraftSchema.parse({
        ...current.data.profile,
        ...profilePatch,
      }),
    },
    status: current.status === 'not_started' ? 'in_progress' : current.status,
    updatedAt: nowIso(),
  }));
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

export function migrateOnboardingDraft(
  raw: unknown,
  accountId: string,
): OnboardingDraftEnvelope {
  return migrateOnboardingDraftWithIssues(raw, accountId).envelope;
}

function migrateOnboardingDraftWithIssues(
  raw: unknown,
  accountId: string,
): {
  envelope: OnboardingDraftEnvelope;
  issues: OnboardingDraftMigrationIssue[];
} {
  if (!isRecord(raw)) throw new Error('Draft onboarding không đúng định dạng.');
  if (raw.version === ONBOARDING_DRAFT_VERSION) {
    return { envelope: normalizeCurrentEnvelope(raw, accountId), issues: [] };
  }
  if (raw.version === PREVIOUS_ONBOARDING_DRAFT_VERSION) {
    return migratePreviousFeatureEnvelope(raw, accountId);
  }
  if (raw.version === LEGACY_ONBOARDING_DRAFT_VERSION) {
    return migrateLegacyFeatureEnvelope(raw, accountId);
  }
  throw new Error(
    `Chưa hỗ trợ draft onboarding phiên bản ${String(raw.version)}.`,
  );
}

function normalizeCurrentEnvelope(
  raw: unknown,
  accountId: string,
): OnboardingDraftEnvelope {
  if (!isRecord(raw)) throw new Error('Draft onboarding không đúng định dạng.');
  if (raw.accountId !== accountId) {
    throw new Error('Draft onboarding không thuộc tài khoản hiện tại.');
  }
  if (raw.version !== ONBOARDING_DRAFT_VERSION) {
    throw new Error('Draft onboarding không đúng phiên bản hiện tại.');
  }

  const data = sanitizeCurrentDraftData(raw.data);
  return {
    accountId,
    currentStep: onboardingStep(raw.currentStep),
    data,
    status: onboardingStatus(raw.status),
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt
        ? raw.updatedAt
        : nowIso(),
    version: ONBOARDING_DRAFT_VERSION,
  };
}

function migratePreviousFeatureEnvelope(
  raw: Record<string, unknown>,
  accountId: string,
): {
  envelope: OnboardingDraftEnvelope;
  issues: OnboardingDraftMigrationIssue[];
} {
  if (raw.accountId !== accountId) {
    throw new Error('Draft onboarding không thuộc tài khoản hiện tại.');
  }
  const data = isRecord(raw.data) ? raw.data : {};
  const updatedAt =
    typeof raw.updatedAt === 'string' && raw.updatedAt
      ? raw.updatedAt
      : nowIso();
  const mediaQueue = migrateLegacyOnboardingMediaQueue(
    data.mediaQueue,
    updatedAt,
  );
  const profile = syncProfileMediaSelection(
    OnboardingDraftSchema.parse(data.profile),
    mediaQueue,
  );
  const migratedData: OnboardingDraftData = { profile };
  if (mediaQueue.length) migratedData.mediaQueue = mediaQueue;
  if (isPendingMediaSelection(data.pendingMediaSelection)) {
    migratedData.pendingMediaSelection = data.pendingMediaSelection;
  }
  if (typeof data.coreProfileCompletedAt === 'string') {
    migratedData.coreProfileCompletedAt = data.coreProfileCompletedAt;
  }
  if (typeof data.completedAt === 'string') {
    migratedData.completedAt = data.completedAt;
  }
  const warnings = sanitizeCompatibilityWarnings(data.compatibilityWarnings);
  if (warnings.length) migratedData.compatibilityWarnings = warnings;

  const issues: OnboardingDraftMigrationIssue[] = [];
  if (Array.isArray(data.mediaQueue) && data.mediaQueue.length > 0) {
    issues.push({
      code: 'legacy_media_staging_migrated',
      message:
        'Media queue cũ đã được chuyển sang canonical durable staging contract.',
      path: 'data.mediaQueue',
      severity: 'warning',
    });
  }

  return {
    envelope: {
      accountId,
      currentStep: onboardingStep(raw.currentStep),
      data: migratedData,
      status: onboardingStatus(raw.status),
      updatedAt,
      version: ONBOARDING_DRAFT_VERSION,
    },
    issues,
  };
}

function migrateLegacyFeatureEnvelope(
  raw: Record<string, unknown>,
  accountId: string,
): {
  envelope: OnboardingDraftEnvelope;
  issues: OnboardingDraftMigrationIssue[];
} {
  if (raw.accountId !== accountId) {
    throw new Error('Draft onboarding không thuộc tài khoản hiện tại.');
  }

  const data = isRecord(raw.data) ? raw.data : {};
  const issues: OnboardingDraftMigrationIssue[] = [];
  const updatedAt =
    typeof raw.updatedAt === 'string' && raw.updatedAt
      ? raw.updatedAt
      : nowIso();
  const mediaQueue = migrateLegacyOnboardingMediaQueue(
    data.mediaQueue,
    updatedAt,
  );
  let profile = createEmptyProfileDraft();

  if (isRecord(data.profileBasics)) {
    const displayName =
      optionalString(data.profileBasics.displayName)?.trim() ?? '';
    if (displayName.length > PROFILE_LIMITS.displayName) {
      return resetLegacyEnvelope(accountId, 'profileBasics.displayName');
    }
    const gender = resolveOptionalCatalogValue(
      GENDER_CATALOG,
      data.profileBasics.gender,
    );
    if (gender === 'invalid') {
      return resetLegacyEnvelope(accountId, 'profileBasics.gender');
    }
    profile = {
      ...profile,
      profileBasics: {
        displayName,
        gameHandle: null,
        genderId: gender,
      },
    };
  }

  const rank = resolveOptionalCatalogValue(RANK_CATALOG, data.rankId);
  if (rank === 'invalid') return resetLegacyEnvelope(accountId, 'rankId');
  profile = { ...profile, rankId: rank };

  const lanes = resolveLegacyList(LANE_CATALOG, data.laneIds, 2);
  if (!lanes.ok) return resetLegacyEnvelope(accountId, 'laneIds');
  profile = {
    ...profile,
    laneSelection: lanes.values[0]
      ? {
          primary: lanes.values[0],
          secondary: lanes.values[1] ?? null,
        }
      : null,
  };

  const heroes = resolveLegacyHeroes(data.heroIds);
  if (!heroes.ok) return resetLegacyEnvelope(accountId, 'heroIds');
  profile = {
    ...profile,
    favoriteHeroes: heroes.values.map((heroId, index) => ({
      heroId,
      priority: index + 1,
    })),
  };

  const habits = adaptLegacyHabitAnswers(data.habits);
  if (!habits.lossless) return resetLegacyEnvelope(accountId, 'habits');
  profile = { ...profile, habits: habits.value };

  const timezone = deviceTimezone();
  if (timezone) {
    profile = { ...profile, timezone };
    if (profile.habits.timePreferenceIds.length > 0) {
      profile = {
        ...profile,
        recurringAvailability: buildRecurringAvailabilityFromTimePreferences({
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          timePreferenceIds: profile.habits.timePreferenceIds,
          timezone,
        }),
      };
      issues.push({
        code: 'legacy_availability_expanded_all_days',
        message:
          'Khung giờ cũ được mở rộng cho cả bảy ngày vì draft cũ không lưu thứ trong tuần.',
        path: 'profile.recurringAvailability',
        severity: 'warning',
      });
    }
  }

  issues.push({
    code: 'legacy_game_handle_missing',
    message: 'Draft cũ chưa có tên trong game riêng; người dùng cần bổ sung.',
    path: 'profile.profileBasics.gameHandle',
    severity: 'warning',
  });

  const legacyStatus = onboardingStatus(raw.status);
  const status =
    legacyStatus === 'media_pending' || legacyStatus === 'completed'
      ? 'in_progress'
      : legacyStatus;
  if (status !== legacyStatus) {
    issues.push({
      code: 'legacy_completed_status_downgraded',
      message:
        'Trạng thái cũ được đưa về in_progress cho đến khi profile canonical hợp lệ.',
      path: 'status',
      severity: 'warning',
    });
  }

  const syncedProfile = syncProfileMediaSelection(profile, mediaQueue);
  return {
    envelope: {
      accountId,
      currentStep: onboardingStep(raw.currentStep),
      data: {
        mediaQueue: mediaQueue.length ? mediaQueue : undefined,
        pendingMediaSelection: isPendingMediaSelection(
          data.pendingMediaSelection,
        )
          ? data.pendingMediaSelection
          : undefined,
        profile: syncedProfile,
      },
      status,
      updatedAt,
      version: ONBOARDING_DRAFT_VERSION,
    },
    issues,
  };
}

function resetLegacyEnvelope(accountId: string, path: string) {
  return {
    envelope: createEmptyOnboardingDraft(accountId),
    issues: [
      {
        code: 'legacy_value_invalid' as const,
        message:
          'Draft cũ chứa giá trị không thuộc canonical catalog và đã được đặt lại an toàn.',
        path,
        severity: 'error' as const,
      },
    ],
  };
}

function sanitizeCurrentDraftData(value: unknown): OnboardingDraftData {
  if (!isRecord(value))
    throw new Error('Dữ liệu draft onboarding không hợp lệ.');
  const mediaQueue = MediaStagingQueueSchema.parse(value.mediaQueue ?? []);
  const profile = syncProfileMediaSelection(
    OnboardingDraftSchema.parse(value.profile),
    mediaQueue,
  );
  const data: OnboardingDraftData = { profile };

  if (mediaQueue.length) data.mediaQueue = mediaQueue;
  if (isPendingMediaSelection(value.pendingMediaSelection)) {
    data.pendingMediaSelection = value.pendingMediaSelection;
  }
  if (typeof value.coreProfileCompletedAt === 'string') {
    data.coreProfileCompletedAt = value.coreProfileCompletedAt;
  }
  if (typeof value.completedAt === 'string') {
    data.completedAt = value.completedAt;
  }
  const warnings = sanitizeCompatibilityWarnings(value.compatibilityWarnings);
  if (warnings.length) data.compatibilityWarnings = warnings;
  return data;
}

function syncProfileMediaSelection(
  profile: OnboardingDraft,
  mediaQueue: OnboardingMediaQueueItem[],
): OnboardingDraft {
  return OnboardingDraftSchema.parse({
    ...profile,
    mediaSelection: {
      avatarSelected: mediaQueue.some((item) => item.slot === 'avatar'),
      coverSelected: mediaQueue.some((item) => item.slot === 'cover'),
      wallPositions: mediaQueue
        .filter((item) => item.slot === 'wall')
        .map((item) => item.position)
        .sort((left, right) => left - right),
    },
  });
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

function resolveOptionalCatalogValue<
  const Options extends readonly {
    id: string;
    label: string;
    legacyValue: string;
  }[],
>(options: Options, value: unknown): Options[number]['id'] | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  const resolved = resolveCatalogId(options, value);
  return resolved.ok ? resolved.id : 'invalid';
}

function resolveLegacyList<
  const Options extends readonly {
    id: string;
    label: string;
    legacyValue: string;
  }[],
>(options: Options, value: unknown, limit: number) {
  if (value === null || value === undefined) {
    return { ok: true as const, values: [] as Options[number]['id'][] };
  }
  if (!Array.isArray(value)) return { ok: false as const, values: [] };
  const values: Options[number]['id'][] = [];
  for (const item of value) {
    const resolved = resolveCatalogId(options, item);
    if (!resolved.ok) return { ok: false as const, values: [] };
    if (!values.includes(resolved.id) && values.length < limit) {
      values.push(resolved.id);
    }
  }
  return { ok: true as const, values };
}

function resolveLegacyHeroes(
  value: unknown,
): { ok: true; values: HeroId[] } | { ok: false; values: [] } {
  if (value === null || value === undefined) {
    return { ok: true, values: [] };
  }
  if (!Array.isArray(value)) return { ok: false, values: [] };
  const values: HeroId[] = [];
  for (const item of value) {
    const resolved = resolveHeroId(item);
    if (!resolved.ok) return { ok: false, values: [] };
    if (
      !values.includes(resolved.id) &&
      values.length < PROFILE_LIMITS.favoriteHeroes
    ) {
      values.push(resolved.id);
    }
  }
  return { ok: true, values };
}

function sanitizeCompatibilityWarnings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is LegacyProfileAdapterIssue => {
    if (!isRecord(item)) return false;
    return (
      typeof item.code === 'string' &&
      typeof item.message === 'string' &&
      typeof item.path === 'string' &&
      (item.severity === 'error' || item.severity === 'warning')
    );
  });
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

function deviceTimezone() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const parsed = TimezoneSchema.safeParse(timezone);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
