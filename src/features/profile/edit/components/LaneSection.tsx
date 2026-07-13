import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { LiquidChip } from '@/shared/components/liquid';

import { ProfileText } from '../../components/ProfileShared';
import type { ProfileReferenceOption } from '../../services/profile-service';
import type { ProfileEditForm } from '../model/profile-edit-model';
import {
  ProfileEditFieldLabel,
  ProfileEditSection,
  UnsupportedProfileValue,
} from './ProfileEditPrimitives';
import { profileEditStyles as styles } from './profile-edit-styles';

export function LaneSection({
  lanes,
  onChange,
  onLimitReached,
  roles,
}: {
  lanes: ProfileEditForm['lanes'];
  onChange: (lanes: ProfileEditForm['lanes']) => void;
  onLimitReached: () => void;
  roles: ProfileReferenceOption[];
}) {
  const selected = lanes.roleIds;
  const unknownIds = selected.filter(
    (roleId) => !roles.some((role) => role.id === roleId),
  );

  const toggle = (roleId: string) => {
    if (selected.includes(roleId)) {
      onChange({ roleIds: selected.filter((item) => item !== roleId) });
      return;
    }
    if (selected.length >= 2) {
      onLimitReached();
      return;
    }
    onChange({ roleIds: [...selected, roleId] });
  };

  return (
    <ProfileEditSection
      icon="map-outline"
      subtitle="Backend hiện chỉ lưu tập vai trò, chưa có lane-order contract. UI không tuyên bố primary/secondary được persist."
      title="Lane"
    >
      <ProfileEditFieldLabel
        label="Vai trò đã chọn"
        meta={`${selected.length}/2`}
      />
      {selected.map((roleId) => {
        const role = roles.find((option) => option.id === roleId);
        if (!role) return null;
        return (
          <View key={roleId} style={styles.laneSelectedRow}>
            <ProfileText style={styles.fieldLabel}>{role.label}</ProfileText>
            <Pressable
              accessibilityLabel={`Bỏ vai trò ${role.label}`}
              onPress={() => toggle(roleId)}
            >
              <Ionicons color="rgba(255,216,168,0.82)" name="close" size={17} />
            </Pressable>
          </View>
        );
      })}
      {unknownIds.map((roleId) => (
        <UnsupportedProfileValue key={roleId} label="Lane" value={roleId} />
      ))}
      <ProfileEditFieldLabel label="Chọn vai trò" />
      <View style={styles.chipWrap}>
        {roles.map((role) => {
          const isSelected = selected.includes(role.id);
          const disabled = !isSelected && selected.length >= 2;
          return (
            <LiquidChip
              accessibilityLabel={`Vai trò ${role.label}`}
              accessibilityState={{ disabled, selected: isSelected }}
              density="compact"
              disabled={disabled}
              key={role.id}
              onPress={() => toggle(role.id)}
              selected={isSelected}
              textStyle={styles.chipText}
              variant="cyan"
            >
              {role.label}
            </LiquidChip>
          );
        })}
      </View>
    </ProfileEditSection>
  );
}
