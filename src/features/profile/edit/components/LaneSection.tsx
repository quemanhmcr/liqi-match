import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import {
  LANE_CATALOG,
  PROFILE_LIMITS,
  type LaneSelection,
  type LaneSlug,
} from '@/entities/player-profile';
import { LiqiChip } from '@/shared/components/liqi';

import { ProfileText } from '../../components/ProfileShared';
import {
  ProfileEditFieldLabel,
  ProfileEditSection,
} from './ProfileEditPrimitives';
import { profileEditStyles as styles } from './profile-edit-styles';

export function LaneSection({
  onChange,
  onLimitReached,
  selection,
}: {
  onChange: (selection: LaneSelection | null) => void;
  onLimitReached: () => void;
  selection: LaneSelection | null;
}) {
  const selected = selection
    ? [selection.primary, selection.secondary].filter(
        (value): value is LaneSlug => Boolean(value),
      )
    : [];

  const toggle = (laneId: LaneSlug) => {
    if (!selection) {
      onChange({ primary: laneId, secondary: null });
      return;
    }
    if (selection.primary === laneId) {
      onChange(
        selection.secondary
          ? { primary: selection.secondary, secondary: null }
          : null,
      );
      return;
    }
    if (selection.secondary === laneId) {
      onChange({ ...selection, secondary: null });
      return;
    }
    if (selection.secondary) {
      onLimitReached();
      return;
    }
    onChange({ ...selection, secondary: laneId });
  };

  return (
    <ProfileEditSection
      icon="map-outline"
      subtitle="Form giữ primary/secondary canonical; backend hiện chỉ lưu tập vai trò nên thứ tự chưa round-trip được."
      title="Lane"
    >
      <ProfileEditFieldLabel
        label="Lane đã chọn"
        meta={`${selected.length}/${PROFILE_LIMITS.lanes}`}
      />
      {selected.map((laneId, index) => {
        const option = LANE_CATALOG.find((lane) => lane.id === laneId)!;
        return (
          <View key={laneId} style={styles.laneSelectedRow}>
            <ProfileText style={styles.fieldLabel}>
              {index === 0 ? 'Ưu tiên 1' : 'Ưu tiên 2'} · {option.label}
            </ProfileText>
            <Pressable
              accessibilityLabel={`Bỏ vai trò ${option.label}`}
              onPress={() => toggle(laneId)}
            >
              <Ionicons color="rgba(255,216,168,0.82)" name="close" size={17} />
            </Pressable>
          </View>
        );
      })}
      <ProfileEditFieldLabel label="Chọn lane" />
      <View style={styles.chipWrap}>
        {LANE_CATALOG.map((lane) => {
          const isSelected = selected.includes(lane.id);
          const disabled =
            !isSelected && selected.length >= PROFILE_LIMITS.lanes;
          return (
            <LiqiChip
              accessibilityLabel={`Vai trò ${lane.label}`}
              accessibilityState={{ disabled, selected: isSelected }}
              density="compact"
              disabled={disabled}
              key={lane.id}
              onPress={() => toggle(lane.id)}
              selected={isSelected}
              textStyle={styles.chipText}
              variant="cyan"
            >
              {lane.label}
            </LiqiChip>
          );
        })}
      </View>
    </ProfileEditSection>
  );
}
