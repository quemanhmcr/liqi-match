import type {
  DiscoverFacetId,
  DiscoverPlayerRecommendation,
  DiscoverSet,
  DiscoverVibe,
} from '../contracts/discover-contracts';

export function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function filterVibes(
  items: readonly DiscoverVibe[],
  query: string,
  facets: readonly DiscoverFacetId[],
) {
  return rankItems(
    items,
    query,
    facets,
    (item) => item.facetIds,
    (item) => item.title,
    (item) => [formatEngagement(item)],
  );
}

export function filterSets(
  items: readonly DiscoverSet[],
  query: string,
  facets: readonly DiscoverFacetId[],
) {
  return rankItems(
    items,
    query,
    facets,
    (item) => item.facetIds,
    (item) => item.title,
    (item) => [
      item.mode,
      ...item.recruitment.missingRoles.map((role) => role.name),
      ...item.tags.map((tag) => tag.label),
    ],
  );
}

export function filterPlayers(
  items: readonly DiscoverPlayerRecommendation[],
  query: string,
  facets: readonly DiscoverFacetId[],
) {
  return rankItems(
    items,
    query,
    facets,
    (item) => item.facetIds,
    (item) => item.displayName,
    (item) => [
      item.rank?.name ?? '',
      item.primaryRole?.name ?? '',
      ...item.matchReasons.map((reason) => reason.label),
    ],
  );
}

function rankItems<T>(
  items: readonly T[],
  query: string,
  facets: readonly DiscoverFacetId[],
  getFacets: (item: T) => readonly DiscoverFacetId[],
  getPrimary: (item: T) => string,
  getSecondary: (item: T) => readonly string[],
) {
  const normalizedQuery = normalizeSearchText(query);
  return items
    .map((item, index) => {
      if (!facets.every((facet) => getFacets(item).includes(facet)))
        return null;
      const score = scoreSearchMatch(
        getPrimary(item),
        getSecondary(item),
        normalizedQuery,
      );
      return score === null ? null : { index, item, score };
    })
    .filter(
      (entry): entry is { index: number; item: T; score: number } =>
        entry !== null,
    )
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item);
}

function scoreSearchMatch(
  primaryText: string,
  secondaryText: readonly string[],
  normalizedQuery: string,
) {
  if (!normalizedQuery) return 0;
  const primary = normalizeSearchText(primaryText);
  const secondary = normalizeSearchText(secondaryText.join(' '));
  const document = `${primary} ${secondary}`;
  const tokens = normalizedQuery.split(' ');
  if (!tokens.every((token) => document.includes(token))) return null;

  let score = 0;
  if (primary === normalizedQuery) score += 120;
  else if (primary.startsWith(normalizedQuery)) score += 90;
  else if (primary.includes(normalizedQuery)) score += 70;

  const words = primary.split(' ');
  for (const token of tokens) {
    if (words.includes(token)) score += 18;
    else if (words.some((word) => word.startsWith(token))) score += 12;
    else if (primary.includes(token)) score += 8;
    else if (secondary.includes(token)) score += 3;
  }
  return score;
}

function formatEngagement(item: DiscoverVibe) {
  return `${item.engagement.count} ${item.engagement.kind}`;
}
