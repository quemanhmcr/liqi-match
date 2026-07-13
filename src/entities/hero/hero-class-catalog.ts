export type HeroClassSlug =
  'fighter' | 'tank' | 'mage' | 'assassin' | 'support' | 'marksman';

export type HeroClassLabel =
  'Đấu sĩ' | 'Đỡ đòn' | 'Pháp sư' | 'Sát thủ' | 'Trợ thủ' | 'Xạ thủ';

export type HeroClassCatalogOption = Readonly<{
  id: HeroClassSlug;
  label: HeroClassLabel;
  legacyValue: HeroClassSlug;
}>;

/** Stable gameplay classes. Labels are presentation only. */
export const HERO_CLASS_CATALOG = [
  { id: 'fighter', label: 'Đấu sĩ', legacyValue: 'fighter' },
  { id: 'tank', label: 'Đỡ đòn', legacyValue: 'tank' },
  { id: 'mage', label: 'Pháp sư', legacyValue: 'mage' },
  { id: 'assassin', label: 'Sát thủ', legacyValue: 'assassin' },
  { id: 'support', label: 'Trợ thủ', legacyValue: 'support' },
  { id: 'marksman', label: 'Xạ thủ', legacyValue: 'marksman' },
] as const satisfies readonly HeroClassCatalogOption[];

export function heroClassOption(id: HeroClassSlug) {
  return HERO_CLASS_CATALOG.find((option) => option.id === id);
}
