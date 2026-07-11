import type {
  HomeReadyMode,
  MatchedSet,
  MatchedSetStatus,
} from '../home-dashboard-service';

const readyModeLabels: Record<HomeReadyMode['id'], string> = {
  normal: 'Thường',
  rank: 'Xếp hạng',
  setlove: 'Set Love',
  soulmate: 'Tri kỉ',
  team: 'Đội xếp hạng',
};

const primaryReadyModeIds = new Set<HomeReadyMode['id']>([
  'setlove',
  'soulmate',
  'normal',
  'rank',
]);

const matchedKindLabels: Record<MatchedSet['kind'], string> = {
  Normal: 'Thường',
  Rank: 'Xếp hạng',
  'Set Love': 'Set Love',
  'Team Rank': 'Đội xếp hạng',
  'Tri kỉ': 'Tri kỉ',
};

const matchedStatusLabels: Record<MatchedSetStatus, string> = {
  idle: 'Chờ phản hồi',
  offline: 'Ngoại tuyến',
  online: 'Online',
  ready: 'Sẵn sàng',
};

export function selectPrimaryHomeReadyModes(modes: readonly HomeReadyMode[]) {
  return modes.filter((mode) => primaryReadyModeIds.has(mode.id));
}

export function homeReadyModeLabel(mode: HomeReadyMode) {
  return readyModeLabels[mode.id];
}

export function matchedSetKindLabel(kind: MatchedSet['kind']) {
  return matchedKindLabels[kind];
}

export function matchedSetStatusLabel(status: MatchedSetStatus) {
  return matchedStatusLabels[status];
}

export function formatMatchedConnectionCount(count: number) {
  const normalizedCount = Math.max(0, Math.floor(count));
  return normalizedCount ? `${normalizedCount} match mới` : 'Chưa có match mới';
}

export function buildMatchedSetTags({
  heroNames,
  maxHeroes = 3,
  roleNames,
}: {
  heroNames: readonly string[];
  maxHeroes?: number;
  roleNames: readonly string[];
}) {
  const heroes = uniqueLabels(heroNames);
  const visibleHeroCount = Math.max(1, Math.floor(maxHeroes));

  if (heroes.length) {
    const visibleHeroes = heroes.slice(0, visibleHeroCount);
    const overflowCount = heroes.length - visibleHeroes.length;
    return overflowCount
      ? [...visibleHeroes, `+${overflowCount}`]
      : visibleHeroes;
  }

  return uniqueLabels(roleNames).slice(0, 2);
}

export function chatActionAccessibilityLabel(
  name: string,
  unreadCount: number | undefined,
) {
  const normalizedCount = Math.max(0, Math.floor(unreadCount ?? 0));
  return normalizedCount
    ? `Nhắn tin với ${name}, ${normalizedCount} tin mới`
    : `Nhắn tin với ${name}`;
}

function uniqueLabels(labels: readonly string[]) {
  return [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
}
