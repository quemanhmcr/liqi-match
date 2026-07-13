import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';

import {
  HEROES,
  HERO_CLASS_CATALOG,
  HERO_DOMAIN_CATALOG,
  heroDefinitionById,
  type HeroId,
} from '@/entities/hero';
import { PROFILE_LIMITS } from '@/entities/player-profile';
import { LiquidButton, LiquidOrbButton } from '@/shared/components/liquid';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

import { ProfileText } from '../../components/ProfileShared';
import type { ProfileEditHero } from '../model/profile-edit-model';
import { ProfileEditSection } from './ProfileEditPrimitives';
import { profileEditStyles as styles } from './profile-edit-styles';

const fallbackHeroImage =
  require('../../../../../assets/anh_mau2/heroes/aya.webp') as ImageSourcePropType;

const heroImageById = new Map<string, ImageSourcePropType>(
  HEROES.map((hero) => [hero.id, hero.image]),
);

export function HeroSection({
  heroes,
  onChange,
}: {
  heroes: ProfileEditHero[];
  onChange: (heroes: ProfileEditHero[]) => void;
}) {
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);

  const updateHero = (slot: number, patch: Partial<ProfileEditHero>) => {
    onChange(
      normalizePriorities(
        heroes.map((hero, index) =>
          index === slot ? { ...hero, ...patch } : hero,
        ),
      ),
    );
  };

  return (
    <>
      <ProfileEditSection
        icon="shield-checkmark-outline"
        subtitle="Form dùng canonical HeroId và priority. Backend metadata mới được chuẩn bị trước khi hero cũ bị xoá."
        title="Tướng tủ"
      >
        {Array.from({ length: PROFILE_LIMITS.favoriteHeroes }).map(
          (_, index) => {
            const hero = heroes[index];
            const definition = hero
              ? heroDefinitionById(hero.heroId)
              : undefined;
            return (
              <View key={index} style={styles.heroEditRow}>
                <View style={styles.heroEditIndex}>
                  <ProfileText style={styles.heroEditIndexText}>
                    {index + 1}
                  </ProfileText>
                </View>
                <Image
                  source={heroImage(hero?.heroId)}
                  style={styles.heroEditImage}
                />
                <View style={styles.heroEditCopy}>
                  <ProfileText numberOfLines={1} style={styles.heroEditName}>
                    {definition?.name ?? 'Chọn tướng'}
                  </ProfileText>
                  {hero && definition ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 6,
                        marginTop: 6,
                      }}
                    >
                      <HeroNumberInput
                        accessibilityLabel={`Số trận ${definition.name}`}
                        max={99999}
                        suffix="trận"
                        value={hero.matches}
                        onChange={(matches) => updateHero(index, { matches })}
                      />
                      <HeroNumberInput
                        accessibilityLabel={`Tỷ lệ thắng ${definition.name}`}
                        max={100}
                        suffix="%"
                        value={hero.winRate}
                        onChange={(winRate) => updateHero(index, { winRate })}
                      />
                    </View>
                  ) : (
                    <ProfileText style={styles.heroEditMeta}>
                      Slot đang trống
                    </ProfileText>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <LiquidButton
                    accessibilityLabel={`Đổi tướng tủ slot ${index + 1}`}
                    glowIntensity="none"
                    onPress={() => setPickerSlot(index)}
                    radius={16}
                    variant="ghost"
                    withShadow={false}
                  >
                    <ProfileText style={styles.fieldLabel}>Đổi</ProfileText>
                  </LiquidButton>
                  {hero && definition ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        accessibilityLabel={`Ưu tiên ${definition.name} cao hơn`}
                        disabled={index === 0}
                        onPress={() =>
                          onChange(moveHero(heroes, index, index - 1))
                        }
                      >
                        <Ionicons
                          color={
                            index === 0
                              ? 'rgba(205,216,245,0.28)'
                              : 'rgba(186,239,255,0.72)'
                          }
                          name="arrow-up"
                          size={15}
                        />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Ưu tiên ${definition.name} thấp hơn`}
                        disabled={index >= heroes.length - 1}
                        onPress={() =>
                          onChange(moveHero(heroes, index, index + 1))
                        }
                      >
                        <Ionicons
                          color={
                            index >= heroes.length - 1
                              ? 'rgba(205,216,245,0.28)'
                              : 'rgba(186,239,255,0.72)'
                          }
                          name="arrow-down"
                          size={15}
                        />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Bỏ tướng ${definition.name}`}
                        onPress={() =>
                          onChange(
                            normalizePriorities(
                              heroes.filter(
                                (_, heroIndex) => heroIndex !== index,
                              ),
                            ),
                          )
                        }
                      >
                        <Ionicons
                          color="rgba(255,216,168,0.82)"
                          name="close"
                          size={16}
                        />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          },
        )}
      </ProfileEditSection>
      <HeroPickerModal
        onClose={() => setPickerSlot(null)}
        onSelect={(heroId) => {
          if (pickerSlot !== null) {
            onChange(replaceHero(heroes, pickerSlot, heroId));
          }
          setPickerSlot(null);
        }}
        selectedHeroes={heroes}
        slot={pickerSlot}
      />
    </>
  );
}

function HeroNumberInput({
  accessibilityLabel,
  max,
  onChange,
  suffix,
  value,
}: {
  accessibilityLabel: string;
  max: number;
  onChange: (value: number | undefined) => void;
  suffix: string;
  value?: number;
}) {
  return (
    <View style={styles.heroInputRow}>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        keyboardType="number-pad"
        maxLength={5}
        onChangeText={(text) => onChange(parseOptionalInteger(text, max))}
        placeholder="—"
        placeholderTextColor="rgba(205,216,245,0.34)"
        style={styles.heroInput}
        value={value === undefined ? '' : String(value)}
      />
      <ProfileText style={styles.heroInputSuffix}>{suffix}</ProfileText>
    </View>
  );
}

function HeroPickerModal({
  onClose,
  onSelect,
  selectedHeroes,
  slot,
}: {
  onClose: () => void;
  onSelect: (heroId: HeroId) => void;
  selectedHeroes: ProfileEditHero[];
  slot: number | null;
}) {
  const [search, setSearch] = useState('');
  const selectedIds = selectedHeroes.map((hero) => hero.heroId);
  const currentId = slot === null ? undefined : selectedHeroes[slot]?.heroId;
  const query = search.trim().toLowerCase();
  const filtered = HERO_DOMAIN_CATALOG.filter((hero) => {
    const classLabel = heroClassLabel(hero.classSlug);
    return query
      ? `${hero.name} ${classLabel}`.toLowerCase().includes(query)
      : true;
  }).slice(0, 80);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={slot !== null}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.heroSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <ProfileText style={styles.sheetTitle}>Chọn tướng</ProfileText>
              <ProfileText style={styles.sheetSubtitle}>
                Không thể chọn trùng ở nhiều priority.
              </ProfileText>
            </View>
            <LiquidOrbButton
              accessibilityLabel="Đóng chọn tướng"
              onPress={onClose}
              size={36}
            >
              <Ionicons
                color={liquidColors.text.primary}
                name="close"
                size={18}
              />
            </LiquidOrbButton>
          </View>
          <View style={styles.searchBox}>
            <Ionicons color="rgba(205,216,245,0.62)" name="search" size={16} />
            <TextInput
              accessibilityLabel="Tìm tướng"
              onChangeText={setSearch}
              placeholder="Tìm tướng"
              placeholderTextColor="rgba(205,216,245,0.42)"
              style={styles.searchInput}
              value={search}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {filtered.map((hero) => {
              const selectedElsewhere =
                selectedIds.includes(hero.id) && hero.id !== currentId;
              return (
                <Pressable
                  accessibilityLabel={`Chọn ${hero.name}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: selectedElsewhere }}
                  disabled={selectedElsewhere}
                  key={hero.id}
                  onPress={() => onSelect(hero.id)}
                  style={({ pressed }) => [
                    styles.heroPickerRow,
                    selectedElsewhere && styles.heroPickerDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Image
                    source={heroImage(hero.id)}
                    style={styles.heroPickerImage}
                  />
                  <View style={styles.heroPickerCopy}>
                    <ProfileText style={styles.heroPickerName}>
                      {hero.name}
                    </ProfileText>
                    <ProfileText style={styles.heroPickerMeta}>
                      {heroClassLabel(hero.classSlug)}
                    </ProfileText>
                  </View>
                  {selectedElsewhere ? (
                    <ProfileText style={styles.heroPickerMeta}>
                      Đã chọn
                    </ProfileText>
                  ) : (
                    <Ionicons
                      color="rgba(186,239,255,0.72)"
                      name="chevron-forward"
                      size={17}
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function replaceHero(heroes: ProfileEditHero[], slot: number, heroId: HeroId) {
  const withoutDuplicate = heroes.filter(
    (hero, index) => index === slot || hero.heroId !== heroId,
  );
  const previous = heroes[slot];
  withoutDuplicate[slot] = {
    heroId,
    matches: previous?.matches,
    priority: slot + 1,
    winRate: previous?.winRate,
  };
  return normalizePriorities(
    withoutDuplicate.filter(Boolean).slice(0, PROFILE_LIMITS.favoriteHeroes),
  );
}

function moveHero(heroes: ProfileEditHero[], from: number, to: number) {
  if (to < 0 || to >= heroes.length) return heroes;
  const next = [...heroes];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return normalizePriorities(next);
}

function normalizePriorities(heroes: ProfileEditHero[]) {
  return heroes.map((hero, index) => ({ ...hero, priority: index + 1 }));
}

function parseOptionalInteger(value: string, max: number) {
  const digits = value.replace(/[^0-9]/g, '');
  if (!digits) return undefined;
  return Math.min(max, Number(digits));
}

function heroImage(heroId: HeroId | undefined) {
  return (heroId && heroImageById.get(heroId)) || fallbackHeroImage;
}

function heroClassLabel(classSlug: string) {
  return (
    HERO_CLASS_CATALOG.find((heroClass) => heroClass.id === classSlug)?.label ??
    classSlug
  );
}
