import { describe, expect, it } from '@jest/globals';

import { LANE_CATALOG, RANK_CATALOG } from '../catalogs';
import {
  legacyValueForCatalogId,
  resolveCatalogId,
  resolveHeroId,
} from '../legacy-value-resolver';

describe('legacy profile value resolver', () => {
  it('accepts canonical IDs and exact backend values with an explicit source', () => {
    expect(resolveCatalogId(RANK_CATALOG, 'grandmaster-iv')).toEqual({
      id: 'grandmaster-iv',
      ok: true,
      source: 'canonical-id',
    });
    expect(resolveCatalogId(RANK_CATALOG, 'grandmaster_iv')).toEqual({
      id: 'grandmaster-iv',
      ok: true,
      source: 'legacy-value',
    });
  });

  it('does not infer rank or lane semantics from display labels', () => {
    expect(resolveCatalogId(RANK_CATALOG, 'Đại Cao Thủ IV')).toEqual({
      code: 'unknown_legacy_value',
      ok: false,
      value: 'Đại Cao Thủ IV',
    });
    expect(resolveCatalogId(LANE_CATALOG, 'Đi Rừng')).toEqual({
      code: 'unknown_legacy_value',
      ok: false,
      value: 'Đi Rừng',
    });
  });

  it('distinguishes invalid input types from unknown string values', () => {
    expect(resolveCatalogId(RANK_CATALOG, null)).toEqual({
      code: 'invalid_value_type',
      ok: false,
      value: null,
    });
    expect(resolveCatalogId(RANK_CATALOG, 'mythic')).toEqual({
      code: 'unknown_legacy_value',
      ok: false,
      value: 'mythic',
    });
  });

  it('resolves canonical hero IDs and exact database slugs, never hero names', () => {
    expect(resolveHeroId('flowborn-phep')).toEqual({
      id: 'flowborn-phep',
      ok: true,
      source: 'canonical-id',
    });
    expect(resolveHeroId('flowborn_phep')).toEqual({
      id: 'flowborn-phep',
      ok: true,
      source: 'legacy-value',
    });
    expect(resolveHeroId('Flowborn Phép')).toEqual({
      code: 'unknown_legacy_value',
      ok: false,
      value: 'Flowborn Phép',
    });
  });

  it('maps schema-validated IDs back to exact backend values', () => {
    expect(legacyValueForCatalogId(RANK_CATALOG, 'grandmaster-iv')).toBe(
      'grandmaster_iv',
    );
  });
});
