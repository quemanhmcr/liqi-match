import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  GENDER_CATALOG,
  PROFILE_LIMITS,
  type GenderId,
} from '@/entities/player-profile';
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

const maxBioLength = 80;

const statusOptions = [
  { label: 'Sẵn sàng', value: 'ready' },
  { label: 'Đang bận', value: 'busy' },
  { label: 'Offline', value: 'offline' },
  { label: 'Chỉ bạn bè', value: 'friends' },
] as const;

const genderPresentation: Record<
  GenderId,
  { icon: keyof typeof Ionicons.glyphMap; meta: string }
> = {
  female: { icon: 'female', meta: 'hiện ký hiệu ♀' },
  hidden: { icon: 'remove-outline', meta: 'không hiện trên hồ sơ' },
  male: { icon: 'male', meta: 'hiện ký hiệu ♂' },
};

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
  return (
    <ProfileEditSection
      icon="person-outline"
      subtitle="Tên hiển thị là dữ liệu hồ sơ; không được dùng thay game handle."
      title="Thông tin cá nhân"
    >
      <ProfileEditFieldLabel
        label="Tên hiển thị"
        meta={`${identity.displayName.length}/${PROFILE_LIMITS.displayName}`}
      />
      <TextInput
        accessibilityLabel="Tên hiển thị"
        maxLength={PROFILE_LIMITS.displayName}
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
      <View style={styles.genderOptionRow}>
        {GENDER_CATALOG.map((option) => {
          const isSelected = option.id === identity.genderId;
          const presentation = genderPresentation[option.id];
          return (
            <Pressable
              accessibilityLabel={`Giới tính ${option.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              key={option.id}
              onPress={() => onChange({ ...identity, genderId: option.id })}
              style={({ pressed }) => [
                styles.genderOption,
                isSelected && styles.genderOptionSelected,
                pressed && styles.pressed,
              ]}
            >
              <LinearGradient
                colors={
                  option.id === 'female'
                    ? ['rgba(255,116,211,0.28)', 'rgba(142,92,255,0.12)']
                    : option.id === 'male'
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
                  name={presentation.icon}
                  size={14}
                />
              </View>
              <View style={styles.genderCopy}>
                <ProfileText style={styles.genderLabel}>
                  {option.label}
                </ProfileText>
                <ProfileText numberOfLines={1} style={styles.genderMeta}>
                  {presentation.meta}
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

      <View style={styles.trustedStatsNotice}>
        <Ionicons
          color="rgba(103,232,255,0.88)"
          name="shield-checkmark-outline"
          size={17}
        />
        <View style={styles.trustedStatsNoticeCopy}>
          <ProfileText style={styles.trustedStatsNoticeTitle}>
            Thành tích đã được xác minh tự động
          </ProfileText>
          <ProfileText style={styles.trustedStatsNoticeBody}>
            Số buổi chơi, độ tin cậy và lời khen được tính từ session hoàn tất
            nên không thể tự chỉnh sửa.
          </ProfileText>
        </View>
      </View>
    </ProfileEditSection>
  );
}

export const identitySectionId = 'identity' satisfies ProfileEditSectionId;
