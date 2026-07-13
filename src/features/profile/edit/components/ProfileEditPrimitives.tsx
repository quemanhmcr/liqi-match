import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { LiquidCard, LiquidChip } from '@/shared/components/liquid';

import { ProfileText } from '../../components/ProfileShared';
import type { ProfileReferenceOption } from '../../services/profile-service';
import { profileEditStyles as styles } from './profile-edit-styles';

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

export function ProfileEditOptionGroup({
  label,
  onSelect,
  options,
  selectedId,
}: {
  label: string;
  onSelect: (id: string) => void;
  options: ProfileReferenceOption[];
  selectedId?: string;
}) {
  const unsupported =
    selectedId && !options.some((option) => option.id === selectedId);
  return (
    <>
      <ProfileEditFieldLabel label={label} />
      {unsupported ? (
        <UnsupportedProfileValue label={label} value={selectedId} />
      ) : null}
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

export function ProfileEditStringSingleGroup({
  label,
  onSelect,
  options,
  selected,
}: {
  label: string;
  onSelect: (value: string) => void;
  options: readonly string[];
  selected?: string;
}) {
  const unsupported = selected && !options.includes(selected);
  return (
    <>
      <ProfileEditFieldLabel label={label} />
      {unsupported ? (
        <UnsupportedProfileValue label={label} value={selected} />
      ) : null}
      <View style={styles.chipWrap}>
        {options.map((option) => (
          <LiquidChip
            accessibilityLabel={`${label} ${option}`}
            accessibilityState={{ selected: selected === option }}
            density="compact"
            key={option}
            onPress={() => onSelect(option)}
            selected={selected === option}
            textStyle={styles.chipText}
            variant="purple"
          >
            {option}
          </LiquidChip>
        ))}
      </View>
    </>
  );
}

export function ProfileEditStringMultiGroup({
  label,
  limit,
  onToggle,
  options,
  selected,
}: {
  label: string;
  limit: number;
  onToggle: (value: string) => void;
  options: readonly string[];
  selected?: string[];
}) {
  const values = selected ?? [];
  const unsupported = values.filter((value) => !options.includes(value));
  return (
    <>
      <ProfileEditFieldLabel label={label} meta={`${values.length}/${limit}`} />
      {unsupported.map((value) => (
        <UnsupportedProfileValue key={value} label={label} value={value} />
      ))}
      <View style={styles.chipWrap}>
        {options.map((option) => {
          const isSelected = values.includes(option);
          const disabled = !isSelected && values.length >= limit;
          return (
            <LiquidChip
              accessibilityLabel={`${label} ${option}`}
              accessibilityState={{ disabled, selected: isSelected }}
              density="compact"
              disabled={disabled}
              key={option}
              onPress={() => onToggle(option)}
              selected={isSelected}
              textStyle={styles.chipText}
              variant="purple"
            >
              {option}
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
