import { HERO_DOMAIN_CATALOG, type HeroId } from '@/entities/hero';

import type { CatalogOption } from './catalogs';

export type LegacyValueResolutionSource = 'canonical-id' | 'legacy-value';

export type LegacyValueResolution<Id extends string> =
  | Readonly<{
      id: Id;
      ok: true;
      source: LegacyValueResolutionSource;
    }>
  | Readonly<{
      code: 'invalid_value_type' | 'unknown_legacy_value';
      ok: false;
      value: unknown;
    }>;

type CatalogId<Options extends readonly CatalogOption<string, string>[]> =
  Options[number]['id'];

type CatalogLegacyValue<
  Options extends readonly CatalogOption<string, string>[],
> = Options[number]['legacyValue'];

/**
 * Resolves only a stable canonical ID or an exact current-backend value.
 * Display labels are never treated as identity unless the backend value is
 * intentionally identical to that label in the catalog.
 */
export function resolveCatalogId<
  const Options extends readonly CatalogOption<string, string>[],
>(options: Options, value: unknown): LegacyValueResolution<CatalogId<Options>> {
  if (typeof value !== 'string') {
    return { code: 'invalid_value_type', ok: false, value };
  }

  const canonical = options.find((option) => option.id === value);
  if (canonical) {
    return {
      id: canonical.id as CatalogId<Options>,
      ok: true,
      source: 'canonical-id',
    };
  }

  const legacy = options.find((option) => option.legacyValue === value);
  if (legacy) {
    return {
      id: legacy.id as CatalogId<Options>,
      ok: true,
      source: 'legacy-value',
    };
  }

  return { code: 'unknown_legacy_value', ok: false, value };
}

/**
 * Converts a schema-validated canonical ID to the exact current-backend value.
 * A missing catalog entry is a programming/configuration invariant failure.
 */
export function legacyValueForCatalogId<
  const Options extends readonly CatalogOption<string, string>[],
>(options: Options, id: CatalogId<Options>): CatalogLegacyValue<Options> {
  const option = options.find((candidate) => candidate.id === id);
  if (!option) throw new Error(`Catalog has no legacy value for ID: ${id}`);
  return option.legacyValue as CatalogLegacyValue<Options>;
}

/** Resolves a canonical hero ID or exact database hero slug, never a hero name. */
export function resolveHeroId(value: unknown): LegacyValueResolution<HeroId> {
  if (typeof value !== 'string') {
    return { code: 'invalid_value_type', ok: false, value };
  }

  const canonical = HERO_DOMAIN_CATALOG.find((hero) => hero.id === value);
  if (canonical) {
    return { id: canonical.id, ok: true, source: 'canonical-id' };
  }

  const legacy = HERO_DOMAIN_CATALOG.find((hero) => hero.legacySlug === value);
  if (legacy) {
    return { id: legacy.id, ok: true, source: 'legacy-value' };
  }

  return { code: 'unknown_legacy_value', ok: false, value };
}
