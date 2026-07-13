import { describe, expect, it } from '@jest/globals';

import { HERO_CLASS_CATALOG, HERO_DOMAIN_CATALOG } from '@/entities/hero';
import {
  HABIT_CATALOGS,
  LANE_CATALOG,
  PROFILE_DOMAIN_CATALOGS,
  RANK_CATALOG,
} from '../catalogs';

describe('profile domain catalogs', () => {
  it('uses globally unique stable IDs for every habit option', () => {
    const options = Object.values(HABIT_CATALOGS).flat();
    const ids = options.map((option) => option.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.includes('.'))).toBe(true);
    expect(options.some((option) => option.id === option.label)).toBe(false);
  });

  it('keeps canonical IDs separate from current backend compatibility values', () => {
    expect(
      RANK_CATALOG.find((option) => option.id === 'grandmaster-iv'),
    ).toEqual({
      id: 'grandmaster-iv',
      label: 'Đại Cao Thủ IV',
      legacyValue: 'grandmaster_iv',
    });
    expect(LANE_CATALOG.map((option) => option.id)).toEqual([
      'slayer',
      'jungle',
      'mid',
      'dragon',
      'support',
    ]);
  });

  it('publishes explicit hero classes and asset-free hero identity', () => {
    const classIds = new Set(HERO_CLASS_CATALOG.map((option) => option.id));

    expect(HERO_DOMAIN_CATALOG).toHaveLength(128);
    expect(
      HERO_DOMAIN_CATALOG.every((hero) => classIds.has(hero.classSlug)),
    ).toBe(true);
    expect(
      HERO_DOMAIN_CATALOG.find((hero) => hero.id === 'flowborn-phep'),
    ).toMatchObject({ classSlug: 'mage', legacySlug: 'flowborn_phep' });
  });

  it('does not expose a region selector catalog', () => {
    expect('regions' in PROFILE_DOMAIN_CATALOGS).toBe(false);
  });
});
