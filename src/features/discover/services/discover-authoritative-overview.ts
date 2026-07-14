// Generated from the executable Discover overview schema shape.
// All product content is intentionally empty; authoritative player items are
// injected at runtime. This file contains no simulation data.

const emptyOverviewTemplate = {
  contractVersion: 1,
  data: {
    filterOptions: [],
    metrics: [],
    sections: {
      players: {
        defaultSort: 'best_match',
        items: [],
        totalCount: 2,
      },
      sets: {
        defaultSort: 'best_match',
        items: [],
        totalCount: 2,
      },
      vibes: {
        defaultSort: 'popular',
        items: [],
        totalCount: 3,
      },
    },
  },
  meta: {
    generatedAt: '1970-01-01T00:00:00.000Z',
    requestId: '00000000-0000-4000-8000-000000000000',
  },
} as const;
const playerCollectionPaths = [
  ['data', 'sections', 'players', 'items'],
] as const;

export function createAuthoritativePlayerOverview(input: {
  generatedAt: string;
  requestId: string;
}) {
  const result = structuredClone(emptyOverviewTemplate) as Record<
    string,
    unknown
  >;
  setMetadata(result, input.generatedAt, input.requestId);
  for (const path of playerCollectionPaths) {
    setAtPath(result, path, input.players);
  }
  return result;
}

function setAtPath(
  root: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
) {
  let cursor: Record<string, unknown> = root;
  for (const segment of path.slice(0, -1)) {
    const next = cursor[segment];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      throw new Error('Invalid Discover overview template path.');
    }
    cursor = next as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
}

function setMetadata(value: unknown, generatedAt: string, requestId: string) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry) => setMetadata(entry, generatedAt, requestId));
    return;
  }
  const record = value as Record<string, unknown>;
  if ('generatedAt' in record) record.generatedAt = generatedAt;
  if ('requestId' in record) record.requestId = requestId;
  Object.values(record).forEach((entry) =>
    setMetadata(entry, generatedAt, requestId),
  );
}
