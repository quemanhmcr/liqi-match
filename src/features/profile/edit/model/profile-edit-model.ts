import type {
  ProfileFavoriteHero,
  ProfileHeroPickerOption,
  ProfileReferenceOption,
  ProfileStats,
} from '../../services/profile-service';

export const profileEditSections = [
  'identity',
  'gameProfile',
  'lanes',
  'heroes',
  'habits',
  'availability',
  'media',
] as const;

export type ProfileEditSectionId = (typeof profileEditSections)[number];

export type ProfileEditHabitAnswers = {
  comeback_response?: string;
  communication_channels?: string[];
  decision_style?: string;
  feedback_style?: string;
  loss_response?: string;
  seriousness?: string;
  session_length?: string;
  strategy_styles?: string[];
  team_atmospheres?: string[];
  team_goals?: string[];
};

export type ProfileAvailabilitySlot = {
  dayOfWeek: number;
  endsAt: string;
  id: string;
  startsAt: string;
};

export type ProfileEditIdentity = {
  bio: string;
  displayName: string;
  gender?: string;
  stats?: Partial<ProfileStats>;
  status?: string;
};

export type ProfileEditGameProfile = {
  handle: string;
  rankId?: string;
};

export type ProfileEditMediaSlot = 'avatar' | 'cover';

export type ProfileEditLocalAsset = {
  fileName?: string | null;
  fileSize?: number | null;
  height?: number | null;
  mimeType?: string | null;
  uri: string;
  width?: number | null;
};

export type ProfileEditStagedMediaStatus =
  | 'selected'
  | 'ready'
  | 'uploading'
  | 'uploaded-unassociated'
  | 'associated'
  | 'failed';

export type ProfileEditStagedMedia = {
  asset: ProfileEditLocalAsset;
  error?: string;
  slot: ProfileEditMediaSlot;
  status: ProfileEditStagedMediaStatus;
  uploadedAssetId?: string;
  uploadedUrl?: string;
};

export type ProfileEditMedia = {
  avatarFallbackUrl?: string;
  avatarMediaId?: string | null;
  avatarUrl?: string;
  coverMediaId?: string | null;
  coverUrl?: string;
  staged: Partial<Record<ProfileEditMediaSlot, ProfileEditStagedMedia>>;
};

export type ProfileEditForm = {
  availability: {
    presets?: string[];
  };
  gameProfile: ProfileEditGameProfile;
  habits: ProfileEditHabitAnswers;
  heroes: ProfileFavoriteHero[];
  identity: ProfileEditIdentity;
  lanes: {
    roleIds: string[];
  };
  media: ProfileEditMedia;
};

export type ProfileEditDraft = {
  availabilitySlots: ProfileAvailabilitySlot[];
  form: ProfileEditForm;
  heroOptions: ProfileHeroPickerOption[];
  id: string;
  mediaSummary: Record<string, unknown>;
  meta: {
    hasGameProfileRecord: boolean;
    hasHabitRecord: boolean;
    serverRegion?: string;
  };
  ranks: ProfileReferenceOption[];
  roles: ProfileReferenceOption[];
};

export type ProfileEditDirtyState = Record<ProfileEditSectionId, boolean>;

export function getDirtyProfileEditSections(
  baseline: ProfileEditForm,
  current: ProfileEditForm,
): ProfileEditSectionId[] {
  return profileEditSections.filter(
    (section) =>
      stableSectionKey(section, baseline) !==
      stableSectionKey(section, current),
  );
}

export function buildProfileEditDirtyState(
  baseline: ProfileEditForm,
  current: ProfileEditForm,
): ProfileEditDirtyState {
  const dirtySections = new Set(getDirtyProfileEditSections(baseline, current));
  return Object.fromEntries(
    profileEditSections.map((section) => [section, dirtySections.has(section)]),
  ) as ProfileEditDirtyState;
}

export function applySavedProfileEditSections(
  baseline: ProfileEditForm,
  current: ProfileEditForm,
  savedSections: readonly ProfileEditSectionId[],
): ProfileEditForm {
  const next = cloneProfileEditForm(baseline);
  for (const section of savedSections) {
    if (section === 'identity') next.identity = clone(current.identity);
    if (section === 'gameProfile')
      next.gameProfile = clone(current.gameProfile);
    if (section === 'lanes') next.lanes = clone(current.lanes);
    if (section === 'heroes') next.heroes = clone(current.heroes);
    if (section === 'habits') next.habits = clone(current.habits);
    if (section === 'availability')
      next.availability = clone(current.availability);
    if (section === 'media') next.media = clone(current.media);
  }
  return next;
}

export function cloneProfileEditForm(value: ProfileEditForm): ProfileEditForm {
  return clone(value);
}

function stableSectionKey(
  section: ProfileEditSectionId,
  value: ProfileEditForm,
): string {
  if (section === 'identity') return stableKey(value.identity);
  if (section === 'gameProfile') return stableKey(value.gameProfile);
  if (section === 'lanes') return stableKey(value.lanes);
  if (section === 'heroes') {
    return stableKey(
      value.heroes.map((hero) => ({
        heroId: hero.heroId ?? null,
        matches: hero.matches ?? null,
        name: hero.name,
        slug: hero.slug ?? null,
        winRate: hero.winRate ?? null,
      })),
    );
  }
  if (section === 'habits') return stableKey(value.habits);
  if (section === 'availability') return stableKey(value.availability);
  return stableKey({
    avatarMediaId: value.media.avatarMediaId ?? null,
    coverMediaId: value.media.coverMediaId ?? null,
    staged: Object.fromEntries(
      Object.entries(value.media.staged).map(([slot, item]) => [
        slot,
        item
          ? {
              asset: item.asset,
              slot: item.slot,
              status: item.status,
              uploadedAssetId: item.uploadedAssetId ?? null,
            }
          : null,
      ]),
    ),
  });
}

function stableKey(value: unknown): string {
  return JSON.stringify(sortRecord(value));
}

function sortRecord(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortRecord);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortRecord(item)]),
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
