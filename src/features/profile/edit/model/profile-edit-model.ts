import type {
  GenderId,
  HabitAnswersDraft,
  LegacyHabitAdapterIssue,
  HeroId,
  LaneSelection,
  LaneSlug,
  MediaLocalAsset,
  MediaStagingItem,
  MediaStagingSlot,
  RankId,
  RecurringAvailability,
} from '@/entities/player-profile';

import type {
  ProfileStats,
  ProfileStatusValue,
} from '../../services/profile-service';
import type { PlayerProfileIdentitySnapshotV1 } from '@/shared/contracts/core-v1';

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

export type ProfileEditHero = {
  heroId: HeroId;
  matches?: number;
  priority: number;
  winRate?: number;
};

export type ProfileEditIdentity = {
  bio: string;
  displayName: string;
  genderId: GenderId | null;
  stats?: Partial<ProfileStats>;
  status?: ProfileStatusValue | null;
};

export type ProfileEditGameProfile = {
  handle: string;
  rankId: RankId | null;
};

export type ProfileEditMediaSlot = Exclude<MediaStagingSlot, 'wall'>;
export type ProfileEditLocalAsset = MediaLocalAsset;
export type ProfileEditStagedMedia = MediaStagingItem & {
  slot: ProfileEditMediaSlot;
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
  availability: RecurringAvailability | null;
  gameProfile: ProfileEditGameProfile;
  habits: HabitAnswersDraft;
  heroes: ProfileEditHero[];
  identity: ProfileEditIdentity;
  laneSelection: LaneSelection | null;
  media: ProfileEditMedia;
};

export type ProfileEditReadIssue = {
  code:
    | 'hero_selection_unrepresentable'
    | 'invalid_availability'
    | 'lane_selection_unrepresentable'
    | 'unknown_gender'
    | 'unknown_hero'
    | 'unknown_lane'
    | 'unknown_rank';
  path: string;
  value: unknown;
};

export type ProfileEditDraft = {
  form: ProfileEditForm;
  id: string;
  mediaSummary: Record<string, unknown>;
  meta: {
    canonicalProfileId: PlayerProfileIdentitySnapshotV1['profileId'];
    habitIssues: LegacyHabitAdapterIssue[];
    habitsLossless: boolean;
    hasGameProfileRecord: boolean;
    hasHabitRecord: boolean;
    heroesLossless: boolean;
    laneDbIds: Partial<Record<LaneSlug, string>>;
    lanesLossless: boolean;
    playerId: PlayerProfileIdentitySnapshotV1['playerId'];
    profileVersion: number;
    heroDbIds: Partial<Record<HeroId, string>>;
    rankDbIds: Partial<Record<RankId, string>>;
    readIssues: ProfileEditReadIssue[];
    serverRegion?: string;
  };
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
    if (section === 'gameProfile') {
      next.gameProfile = clone(current.gameProfile);
    }
    if (section === 'lanes') {
      next.laneSelection = clone(current.laneSelection);
    }
    if (section === 'heroes') next.heroes = clone(current.heroes);
    if (section === 'habits') next.habits = clone(current.habits);
    if (section === 'availability') {
      next.availability = clone(current.availability);
    }
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
  if (section === 'lanes') return stableKey(value.laneSelection);
  if (section === 'heroes') return stableKey(value.heroes);
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
