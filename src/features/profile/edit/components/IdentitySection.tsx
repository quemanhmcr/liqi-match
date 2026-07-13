import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { LiquidChip } from '@/shared/components/liquid';

import { ProfileText } from '../../components/ProfileShared';
import type {
  ProfileEditIdentity,
  ProfileEditSectionId,
} from '../model/profile-edit-model';
import {
  ProfileEditFieldLabel,
  ProfileEditSection,
  UnsupportedProfileValue,
} from './ProfileEditPrimitives';
import { profileEditStyles as styles } from './profile-edit-styles';

const maxDisplayNameLength = 20;
const maxBioLength = 80;

const statusOptions = [
  { label: 'Sẵn sàng', value: 'ready' },
  { label: 'Đang bận', value: 'busy' },
  { label: 'Offline', value: 'offline' },
  { label: 'Chỉ bạn bè', value: 'friends' },
] as const;

const genderOptions = [
  { icon: 'male', label: 'Nam', meta: 'hiện ký hiệu ♂', value: 'male' },
  { icon: 'female', label: 'Nữ', meta: 'hiện ký hiệu ♀', value: 'female' },
  {
    icon: 'remove-outline',
    label: 'Ẩn',
    meta: 'không hiện trên hồ sơ',
    value: 'hidden',
  },
] as const;

export function IdentitySection({
  identity,
  onChange,
}: {
  identity: ProfileEditIdentity;
  onChange: (identity: ProfileEditIdentity) => void;
}) {
  const [focusedField, setFocusedField] = useState<
    'bio' | 'displayName' | null
  >(null);
  const stats = identity.stats ?? {};

  return (
    <ProfileEditSection
      icon="person-outline"
      subtitle="Tên hiển thị là dữ liệu hồ sơ; không được dùng thay game handle."
      title="Thông tin cá nhân"
    >
      <ProfileEditFieldLabel
        label="Tên hiển thị"
        meta={`${identity.displayName.length}/${maxDisplayNameLength}`}
      />
      <TextInput
        accessibilityLabel="Tên hiển thị"
        maxLength={maxDisplayNameLength}
        onBlur={() => setFocusedField(null)}
        onChangeText={(displayName) => onChange({ ...identity, displayName })}
        onFocus={() => setFocusedField('displayName')}
        placeholder="Tên của bạn"
        placeholderTextColor="rgba(215,224,255,0.36)"
        style={[
          styles.input,
          focusedField === 'displayName' && styles.inputFocused,
        ]}
        value={identity.displayName}
      />
      {identity.displayName.trim().length < 2 ? (
        <ProfileText style={styles.validationText}>
          Tên cần ít nhất 2 ký tự.
        </ProfileText>
      ) : null}

      <ProfileEditFieldLabel label="Giới tính" meta="không bắt buộc" />
      {identity.gender &&
      !genderOptions.some((option) => option.value === identity.gender) ? (
        <UnsupportedProfileValue label="Giới tính" value={identity.gender} />
      ) : null}
      <View style={styles.genderOptionRow}>
        {genderOptions.map((option) => {
          const isSelected = option.value === identity.gender;
          return (
            <Pressable
              accessibilityLabel={`Giới tính ${option.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              key={option.value}
              onPress={() => onChange({ ...identity, gender: option.value })}
              style={({ pressed }) => [
                styles.genderOption,
                isSelected && styles.genderOptionSelected,
                pressed && styles.pressed,
              ]}
            >
              <LinearGradient
                colors={
                  option.value === 'female'
                    ? ['rgba(255,116,211,0.28)', 'rgba(142,92,255,0.12)']
                    : option.value === 'male'
                      ? ['rgba(103,232,255,0.24)', 'rgba(87,111,255,0.11)']
                      : ['rgba(205,216,245,0.12)', 'rgba(255,255,255,0.02)']
                }
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.genderIconShell}>
                <Ionicons
                  color={
                    isSelected
                      ? 'rgba(250,252,255,0.96)'
                      : 'rgba(205,216,245,0.62)'
                  }
                  name={option.icon}
                  size={14}
                />
              </View>
              <View style={styles.genderCopy}>
                <ProfileText style={styles.genderLabel}>
                  {option.label}
                </ProfileText>
                <ProfileText numberOfLines={1} style={styles.genderMeta}>
                  {option.meta}
                </ProfileText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <ProfileEditFieldLabel label="Trạng thái" meta="không bắt buộc" />
      {identity.status &&
      !statusOptions.some((option) => option.value === identity.status) ? (
        <UnsupportedProfileValue label="Trạng thái" value={identity.status} />
      ) : null}
      <View style={styles.chipWrap}>
        {statusOptions.map((option) => (
          <LiquidChip
            accessibilityLabel={`Trạng thái ${option.label}`}
            accessibilityState={{ selected: identity.status === option.value }}
            density="compact"
            key={option.value}
            onPress={() => onChange({ ...identity, status: option.value })}
            selected={identity.status === option.value}
            textStyle={styles.chipText}
            variant="purple"
          >
            {option.label}
          </LiquidChip>
        ))}
      </View>

      <ProfileEditFieldLabel
        label="Bio"
        meta={`${identity.bio.length}/${maxBioLength}`}
      />
      <TextInput
        accessibilityLabel="Câu giới thiệu"
        maxLength={maxBioLength}
        multiline
        onBlur={() => setFocusedField(null)}
        onChangeText={(bio) => onChange({ ...identity, bio })}
        onFocus={() => setFocusedField('bio')}
        placeholder="Teamwork, giao tranh sạch, không toxic."
        placeholderTextColor="rgba(215,224,255,0.36)"
        style={[
          styles.input,
          styles.bioInput,
          focusedField === 'bio' && styles.inputFocused,
        ]}
        textAlignVertical="top"
        value={identity.bio}
      />

      <ProfileEditFieldLabel
        label="Thông số hiển thị"
        meta="để trống nếu chưa có"
      />
      <View style={styles.statsGrid}>
        <StatInput
          label="Số trận"
          max={99999}
          suffix="trận"
          value={stats.matches}
          onChange={(matches) =>
            onChange({ ...identity, stats: { ...stats, matches } })
          }
        />
        <StatInput
          label="Tỷ lệ thắng"
          max={100}
          suffix="%"
          value={stats.winRate}
          onChange={(winRate) =>
            onChange({ ...identity, stats: { ...stats, winRate } })
          }
        />
        <StatInput
          decimal
          label="Đánh giá"
          max={5}
          suffix="★"
          value={stats.rating}
          onChange={(rating) =>
            onChange({ ...identity, stats: { ...stats, rating } })
          }
        />
        <StatInput
          label="Uy tín"
          max={100}
          suffix="điểm"
          value={stats.reputation}
          onChange={(reputation) =>
            onChange({ ...identity, stats: { ...stats, reputation } })
          }
        />
      </View>
    </ProfileEditSection>
  );
}

function StatInput({
  decimal = false,
  label,
  max,
  onChange,
  suffix,
  value,
}: {
  decimal?: boolean;
  label: string;
  max: number;
  onChange: (value: number | undefined) => void;
  suffix: string;
  value?: number;
}) {
  return (
    <View style={styles.statInputCard}>
      <ProfileText style={styles.statInputLabel}>{label}</ProfileText>
      <View style={styles.statInputRow}>
        <TextInput
          accessibilityLabel={label}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          maxLength={decimal ? 3 : 5}
          onChangeText={(text) =>
            onChange(parseOptionalNumber(text, max, decimal))
          }
          placeholder="—"
          placeholderTextColor="rgba(205,216,245,0.34)"
          style={styles.statInput}
          value={value === undefined ? '' : String(value)}
        />
        <ProfileText style={styles.statInputSuffix}>{suffix}</ProfileText>
      </View>
    </View>
  );
}

function parseOptionalNumber(value: string, max: number, decimal: boolean) {
  const normalized = decimal
    ? value.replace(/[^0-9.]/g, '')
    : value.replace(/[^0-9]/g, '');
  if (!normalized) return undefined;
  const number = Number(normalized);
  if (!Number.isFinite(number)) return undefined;
  const rounded = decimal ? Math.round(number * 10) / 10 : Math.round(number);
  return Math.max(0, Math.min(max, rounded));
}

export const identitySectionId = 'identity' satisfies ProfileEditSectionId;
