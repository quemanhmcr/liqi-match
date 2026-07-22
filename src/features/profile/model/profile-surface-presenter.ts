import type { PlayerTrustProjectionV2 } from '@/shared/contracts/core-v2';

import {
  presentProfilePlayStyleHabits,
  type ProfilePlayStyleTile,
} from './profile-play-style-presenter';
import type {
  ProfileSocialStatsProjection,
  ProfileViewModel,
} from '../services/profile-service';

export type ProfileHighlightItem = Readonly<{
  icon: 'game-controller-outline' | 'moon-outline' | 'people-outline';
  label: string;
  value: string;
}>;

export type { ProfilePlayStyleTile } from './profile-play-style-presenter';

export type ProfileSocialStatItem = Readonly<{
  label: string;
  value: string;
}>;

export function presentProfileHighlights(
  profile: ProfileViewModel,
): readonly ProfileHighlightItem[] {
  return [
    {
      icon: 'moon-outline',
      label: 'Trạng thái',
      value: profile.statusLabel || 'Chưa cập nhật',
    },
    {
      icon: 'people-outline',
      label: 'Vai trò',
      value: profile.roleNames[0] ?? 'Chưa cập nhật',
    },
    {
      icon: 'game-controller-outline',
      label: 'Phong cách',
      value: profile.playStyleTags[0] ?? 'Chưa cập nhật',
    },
  ];
}

export function presentProfilePlayStyle(
  profile: ProfileViewModel,
): readonly ProfilePlayStyleTile[] {
  return presentProfilePlayStyleHabits(profile.habitAnswers);
}

export function presentProfileSocialStats(
  projection?: ProfileSocialStatsProjection,
): readonly ProfileSocialStatItem[] {
  return [
    {
      label: 'Lượt thích',
      value: formatSocialCount(projection?.likeCount),
    },
    {
      label: 'Đã match',
      value: formatSocialCount(projection?.matchCount),
    },
    {
      label: 'Đã chơi',
      value: formatSocialCount(projection?.completedSessionCount),
    },
  ];
}

export function presentTrustSummary(projection?: PlayerTrustProjectionV2) {
  const reliabilitySample = projection
    ? projection.completedSessions + projection.noShowCount
    : 0;
  const hasVerifiedEvidence = Boolean(
    projection &&
    (reliabilitySample > 0 || projection.positiveEndorsements > 0),
  );

  return {
    body: projection
      ? hasVerifiedEvidence
        ? 'Các chỉ số dưới đây được tổng hợp từ hoạt động đã xác minh trên LiQi.'
        : 'Chưa đủ hoạt động đã xác minh để hình thành tín hiệu uy tín.'
      : 'Dữ liệu uy tín đã xác minh hiện chưa khả dụng.',
    endorsementLabel: projection
      ? projection.positiveEndorsements > 0
        ? `${projection.positiveEndorsements} lời khen xác minh`
        : 'Chưa có lời khen xác minh'
      : 'Chưa tải lời khen xác minh',
    meta: projection
      ? 'Nguồn: hoạt động đã xác minh trên LiQi'
      : 'Nguồn dữ liệu chưa khả dụng',
    reliabilityLabel:
      projection && reliabilitySample > 0
        ? `${Math.round(projection.completionReliabilityBps / 100)}% độ tin cậy`
        : 'Chưa đủ dữ liệu uy tín',
  } as const;
}

function formatSocialCount(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return '—';

  const normalized = Math.max(0, Math.trunc(value));
  if (normalized < 1000) return String(normalized);
  if (normalized < 1_000_000) {
    return compactSocialNumber(normalized / 1000, 'K');
  }
  return compactSocialNumber(normalized / 1_000_000, 'M');
}

function compactSocialNumber(value: number, suffix: 'K' | 'M') {
  const fractionDigits = value >= 10 ? 0 : 1;
  const compactValue = value
    .toFixed(fractionDigits)
    .replace(/\.0$/, '')
    .replace('.', ',');
  return `${compactValue}${suffix}`;
}

export function presentProfileBio(value: string) {
  const normalized = value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\.\s*,+/g, '. ')
    .replace(/,\s*\./g, '.')
    .replace(/,{2,}/g, ',');
  return normalized || 'Chưa cập nhật lời giới thiệu.';
}

export function profileMetaLine(
  profile: Pick<ProfileViewModel, 'gender' | 'rankName' | 'roleNames'>,
) {
  return compactUnique([
    profile.rankName,
    profile.roleNames[0],
    profileGenderLabel(profile.gender),
  ]).join(' · ');
}

export function presentProfileHeroTags(
  profile: Pick<
    ProfileViewModel,
    'availability' | 'favoriteHeroes' | 'playStyleTags'
  >,
) {
  return {
    availability: profileAvailabilityLabel(profile.availability),
    favoriteHero: normalizedLabel(profile.favoriteHeroes[0]?.name),
    playStyle:
      normalizedLabel(profile.playStyleTags[0]) ?? 'Chưa cập nhật phong cách',
  } as const;
}

function profileGenderLabel(gender: ProfileViewModel['gender']) {
  if (gender === 'female') return 'Nữ';
  if (gender === 'male') return 'Nam';
  return undefined;
}

function profileAvailabilityLabel(
  availability: ProfileViewModel['availability'],
) {
  const slots = availability?.slots ?? [];
  if (!slots.length) return undefined;

  const days = Array.from(new Set(slots.map((slot) => slot.dayOfWeek))).sort();
  const periods = Array.from(
    new Set(slots.map((slot) => profileDayPeriod(slot.startMinute))),
  );
  const daySummary =
    days.length <= 3
      ? days.map(profileDayLabel).join(', ')
      : `${days.length} ngày`;
  const periodSummary =
    periods.length === 1 ? periods[0] : `${periods.length} khung`;

  return `${daySummary} · ${periodSummary}`;
}

function profileDayLabel(day: number) {
  return day === 0 ? 'CN' : `T${day + 1}`;
}

function profileDayPeriod(startMinute: number) {
  if (startMinute >= 5 * 60 && startMinute < 11 * 60) return 'Sáng';
  if (startMinute >= 11 * 60 && startMinute < 14 * 60) return 'Trưa';
  if (startMinute >= 14 * 60 && startMinute < 18 * 60) return 'Chiều';
  if (startMinute >= 18 * 60 && startMinute < 22 * 60) return 'Tối';
  return 'Khuya';
}

function normalizedLabel(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function compactUnique(values: readonly (string | undefined)[]) {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]),
  );
}
