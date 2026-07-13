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

import { HEROES } from '@/entities/hero';
import { LiquidButton, LiquidOrbButton } from '@/shared/components/liquid';
import { liquidColors } from '@/shared/theme/liquid-glass.tokens';

import { ProfileText } from '../../components/ProfileShared';
import type {
  ProfileFavoriteHero,
  ProfileHeroPickerOption,
} from '../../services/profile-service';
import { ProfileEditSection } from './ProfileEditPrimitives';
import { profileEditStyles as styles } from './profile-edit-styles';

const heroSlotCount = 3;
const fallbackHeroImage =
  require('../../../../../assets/anh_mau2/heroes/aya.webp') as ImageSourcePropType;

const heroImageByKey = HEROES.reduce<Record<string, ImageSourcePropType>>(
  (images, hero) => {
    images[heroVisualKey(hero.id)] = hero.image;
    images[heroVisualKey(hero.name)] = hero.image;
    images[heroVisualKey(hero.id.replace(/-/g, '_'))] = hero.image;
    return images;
  },
  {},
);

export function HeroSection({
  heroes,
  onChange,
  options,
}: {
  heroes: ProfileFavoriteHero[];
  onChange: (heroes: ProfileFavoriteHero[]) => void;
  options: ProfileHeroPickerOption[];
}) {
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);

  const updateHero = (slot: number, patch: Partial<ProfileFavoriteHero>) => {
    onChange(
      heroes.map((hero, index) =>
        index === slot ? { ...hero, ...patch } : hero,
      ),
    );
  };

  return (
    <>
      <ProfileEditSection
        icon="shield-checkmark-outline"
        subtitle="Slot là priority hiển thị. Replacement được upsert trước khi record cũ bị xoá."
        title="Tướng tủ"
      >
        {Array.from({ length: heroSlotCount }).map((_, index) => {
          const hero = heroes[index];
          return (
            <View key={index} style={styles.heroEditRow}>
              <View style={styles.heroEditIndex}>
                <ProfileText style={styles.heroEditIndexText}>
                  {index + 1}
                </ProfileText>
              </View>
              <Image source={heroImage(hero)} style={styles.heroEditImage} />
              <View style={styles.heroEditCopy}>
                <ProfileText numberOfLines={1} style={styles.heroEditName}>
                  {hero?.name ?? 'Chọn tướng'}
                </ProfileText>
                {hero ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 6,
                      marginTop: 6,
                    }}
                  >
                    <HeroNumberInput
                      accessibilityLabel={`Số trận ${hero.name}`}
                      max={99999}
                      suffix="trận"
                      value={hero.matches}
                      onChange={(matches) => updateHero(index, { matches })}
                    />
                    <HeroNumberInput
                      accessibilityLabel={`Tỷ lệ thắng ${hero.name}`}
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
                {hero ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      accessibilityLabel={`Ưu tiên ${hero.name} cao hơn`}
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
                      accessibilityLabel={`Ưu tiên ${hero.name} thấp hơn`}
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
                      accessibilityLabel={`Bỏ tướng ${hero.name}`}
                      onPress={() =>
                        onChange(
                          heroes.filter((_, heroIndex) => heroIndex !== index),
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
        })}
      </ProfileEditSection>
      <HeroPickerModal
        onClose={() => setPickerSlot(null)}
        onSelect={(hero) => {
          if (pickerSlot !== null)
            onChange(replaceHero(heroes, pickerSlot, hero));
          setPickerSlot(null);
        }}
        options={options}
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
  options,
  selectedHeroes,
  slot,
}: {
  onClose: () => void;
  onSelect: (hero: ProfileHeroPickerOption) => void;
  options: ProfileHeroPickerOption[];
  selectedHeroes: ProfileFavoriteHero[];
  slot: number | null;
}) {
  const [search, setSearch] = useState('');
  const selectedKeys = selectedHeroes.map(heroKey);
  const currentKey = slot === null ? undefined : heroKey(selectedHeroes[slot]);
  const query = search.trim().toLowerCase();
  const filtered = options
    .filter((hero) =>
      query
        ? `${hero.name} ${hero.role ?? ''}`.toLowerCase().includes(query)
        : true,
    )
    .slice(0, 80);

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
              const key = heroKey(hero);
              const selectedElsewhere = Boolean(
                key && selectedKeys.includes(key) && key !== currentKey,
              );
              return (
                <Pressable
                  accessibilityLabel={`Chọn ${hero.name}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: selectedElsewhere }}
                  disabled={selectedElsewhere}
                  key={`${hero.slug ?? hero.name}-${hero.heroId ?? ''}`}
                  onPress={() => onSelect(hero)}
                  style={({ pressed }) => [
                    styles.heroPickerRow,
                    selectedElsewhere && styles.heroPickerDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Image
                    source={heroImage(hero)}
                    style={styles.heroPickerImage}
                  />
                  <View style={styles.heroPickerCopy}>
                    <ProfileText style={styles.heroPickerName}>
                      {hero.name}
                    </ProfileText>
                    <ProfileText style={styles.heroPickerMeta}>
                      {hero.role ?? 'Chưa có role catalog'}
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

function replaceHero(
  heroes: ProfileFavoriteHero[],
  slot: number,
  selected: ProfileHeroPickerOption,
) {
  const selectedKey = heroKey(selected);
  const next = heroes.filter(
    (hero, index) => index === slot || heroKey(hero) !== selectedKey,
  );
  const previous = heroes[slot];
  next[slot] = {
    heroId: selected.heroId,
    matches: previous?.matches ?? selected.matches,
    name: selected.name,
    slug: selected.slug,
    winRate: previous?.winRate ?? selected.winRate,
  };
  return next.filter(Boolean).slice(0, heroSlotCount);
}

function moveHero(heroes: ProfileFavoriteHero[], from: number, to: number) {
  if (to < 0 || to >= heroes.length) return heroes;
  const next = [...heroes];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

function parseOptionalInteger(value: string, max: number) {
  const digits = value.replace(/[^0-9]/g, '');
  if (!digits) return undefined;
  return Math.min(max, Number(digits));
}

function heroImage(hero: ProfileFavoriteHero | undefined) {
  if (!hero) return fallbackHeroImage;
  return (
    heroImageByKey[heroVisualKey(hero.slug ?? hero.name)] ?? fallbackHeroImage
  );
}

function heroKey(hero: Pick<ProfileFavoriteHero, 'name' | 'slug'> | undefined) {
  return hero ? heroVisualKey(hero.slug ?? hero.name) : '';
}

function heroVisualKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}
