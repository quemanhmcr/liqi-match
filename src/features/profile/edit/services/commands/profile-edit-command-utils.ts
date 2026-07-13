export function compactUnique(values: readonly string[], limit: number) {
  return [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ].slice(0, limit);
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function normalizeBio(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length > 80) {
    throw new Error('Câu giới thiệu tối đa 80 ký tự.');
  }
  return normalized;
}

export function normalizeDisplayName(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length < 2) {
    throw new Error('Tên hiển thị cần ít nhất 2 ký tự.');
  }
  if (normalized.length > 20) {
    throw new Error('Tên hiển thị tối đa 20 ký tự.');
  }
  return normalized;
}

export function normalizeGameHandle(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length < 2) {
    throw new Error('Game handle cần ít nhất 2 ký tự.');
  }
  if (normalized.length > 64) {
    throw new Error('Game handle tối đa 64 ký tự.');
  }
  return normalized;
}

export function normalizeKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeOptionalNumber(value: unknown, max: number) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(0, Math.min(max, Math.round(number)));
}

export function normalizeRating(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(0, Math.min(5, Math.round(number * 10) / 10));
}

export function normalizeSlug(value: string) {
  return normalizeKey(value).replace(/-/g, '_');
}

export function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stableKey(value: unknown) {
  return JSON.stringify(value ?? null);
}

export function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

export function uniqueIds(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}
