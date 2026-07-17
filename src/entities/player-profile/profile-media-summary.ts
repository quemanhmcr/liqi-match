export const PROFILE_WALL_MEDIA_LIMIT = 4 as const;
export const PROFILE_WALL_MEDIA_IDS_KEY = 'wall_media_ids' as const;

export type ProfileWallMediaSlots = readonly (string | null)[];

export function profileMediaSummaryRecord(
  value: unknown,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function parseProfileWallMediaSlots(
  summary: unknown,
): ProfileWallMediaSlots {
  const value = profileMediaSummaryRecord(summary)[PROFILE_WALL_MEDIA_IDS_KEY];
  const raw = Array.isArray(value)
    ? value.slice(0, PROFILE_WALL_MEDIA_LIMIT)
    : [];
  const slots: (string | null)[] = Array.from(
    { length: PROFILE_WALL_MEDIA_LIMIT },
    () => null,
  );
  const seen = new Set<string>();

  raw.forEach((item, index) => {
    if (typeof item !== 'string') return;
    const assetId = item.trim();
    if (!assetId || seen.has(assetId)) return;
    seen.add(assetId);
    slots[index] = assetId;
  });

  return slots;
}

export function profileWallMediaIds(summary: unknown): readonly string[] {
  return parseProfileWallMediaSlots(summary).filter(
    (assetId): assetId is string => Boolean(assetId),
  );
}

export function updateProfileWallMediaSlot(input: {
  assetId: string | null;
  position: number;
  summary: unknown;
}): Record<string, unknown> {
  if (
    !Number.isInteger(input.position) ||
    input.position < 0 ||
    input.position >= PROFILE_WALL_MEDIA_LIMIT
  ) {
    throw new Error('Vị trí ảnh tường không hợp lệ.');
  }

  const next = [...parseProfileWallMediaSlots(input.summary)];
  const assetId = input.assetId?.trim() || null;
  if (assetId) {
    for (let index = 0; index < next.length; index += 1) {
      if (index !== input.position && next[index] === assetId)
        next[index] = null;
    }
  }
  next[input.position] = assetId;

  return {
    ...profileMediaSummaryRecord(input.summary),
    [PROFILE_WALL_MEDIA_IDS_KEY]: next,
    wall_count: next.filter(Boolean).length,
    wall_positions: next.flatMap((item, index) => (item ? [index] : [])),
  };
}
