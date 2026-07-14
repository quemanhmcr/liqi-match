import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { LiquidCard, LiquidChip } from '@/shared/components/liquid';

import { ProfileText } from '../../components/ProfileShared';
import { profileEditStyles as styles } from './profile-edit-styles';

type CatalogOption<Id extends string | number> = Readonly<{
  id: Id;
  label: string;
}>;

export function ProfileEditSection({
  children,
  icon,
  subtitle,
  title,
}: {
  children: ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  subtitle?: string;
  title: string;
}) {
  return (
    <LiquidCard
      density="regular"
      glowIntensity="low"
      style={styles.sectionCard}
    >
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons color="rgba(178,235,255,0.82)" name={icon} size={16} />
        </View>
        <View style={styles.sectionTitleBlock}>
          <ProfileText style={styles.sectionTitle}>{title}</ProfileText>
          {subtitle ? (
            <ProfileText style={styles.sectionSubtitle}>{subtitle}</ProfileText>
          ) : null}
        </View>
      </View>
      {children}
    </LiquidCard>
  );
}

export function ProfileEditFieldLabel({
  label,
  meta,
}: {
  label: string;
  meta?: string;
}) {
  return (
    <View style={styles.fieldLabelRow}>
      <ProfileText style={styles.fieldLabel}>{label}</ProfileText>
      {meta ? <ProfileText style={styles.fieldMeta}>{meta}</ProfileText> : null}
    </View>
  );
}

export function ProfileEditOptionGroup<Id extends string | number>({
  label,
  onSelect,
  options,
  selectedId,
}: {
  label: string;
  onSelect: (id: Id) => void;
  options: readonly CatalogOption<Id>[];
  selectedId: Id | null;
}) {
  return (
    <>
      <ProfileEditFieldLabel label={label} />
      <View style={styles.chipWrap}>
        {options.map((option) => (
          <LiquidChip
            accessibilityLabel={`${label} ${option.label}`}
            accessibilityState={{ selected: selectedId === option.id }}
            density="compact"
            key={option.id}
            onPress={() => onSelect(option.id)}
            selected={selectedId === option.id}
            textStyle={styles.chipText}
            variant="cyan"
          >
            {option.label}
          </LiquidChip>
        ))}
      </View>
    </>
  );
}

export function ProfileEditCatalogSingleGroup<Id extends string | number>({
  label,
  onSelect,
  options,
  selectedId,
}: {
  label: string;
  onSelect: (id: Id) => void;
  options: readonly CatalogOption<Id>[];
  selectedId: Id | null;
}) {
  return (
    <>
      <ProfileEditFieldLabel label={label} />
      <View style={styles.chipWrap}>
        {options.map((option) => (
          <LiquidChip
            accessibilityLabel={`${label} ${option.label}`}
            accessibilityState={{ selected: selectedId === option.id }}
            density="compact"
            key={option.id}
            onPress={() => onSelect(option.id)}
            selected={selectedId === option.id}
            textStyle={styles.chipText}
            variant="purple"
          >
            {option.label}
          </LiquidChip>
        ))}
      </View>
    </>
  );
}

export function ProfileEditCatalogMultiGroup<Id extends string | number>({
  label,
  limit,
  onToggle,
  options,
  selectedIds,
}: {
  label: string;
  limit: number;
  onToggle: (id: Id) => void;
  options: readonly CatalogOption<Id>[];
  selectedIds: readonly Id[];
}) {
  return (
    <>
      <ProfileEditFieldLabel
        label={label}
        meta={`${selectedIds.length}/${limit}`}
      />
      <View style={styles.chipWrap}>
        {options.map((option) => {
          const isSelected = selectedIds.includes(option.id);
          const disabled = !isSelected && selectedIds.length >= limit;
          return (
            <LiquidChip
              accessibilityLabel={`${label} ${option.label}`}
              accessibilityState={{ disabled, selected: isSelected }}
              density="compact"
              disabled={disabled}
              key={option.id}
              onPress={() => onToggle(option.id)}
              selected={isSelected}
              textStyle={styles.chipText}
              variant="purple"
            >
              {option.label}
            </LiquidChip>
          );
        })}
      </View>
    </>
  );
}

export function UnsupportedProfileValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      accessibilityLabel={`${label} legacy unsupported ${value}`}
      style={styles.notice}
    >
      <ProfileText style={styles.noticeTitle}>
        Giá trị cũ chưa được hỗ trợ
      </ProfileText>
      <ProfileText style={styles.errorText}>{value}</ProfileText>
      <ProfileText style={styles.errorText}>
        Giá trị này được giữ nguyên cho đến khi bạn chọn giá trị mới.
      </ProfileText>
    </View>
  );
}
