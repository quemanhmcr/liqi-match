import type {
  ProfileEditHabitAnswers,
  ProfileEditForm,
} from '../model/profile-edit-model';
import {
  ProfileEditSection,
  ProfileEditStringMultiGroup,
  ProfileEditStringSingleGroup,
} from './ProfileEditPrimitives';

const seriousnessOptions = ['Thoải mái', 'Cân bằng', 'Cạnh tranh'] as const;
const communicationOptions = [
  'Voice chủ động',
  'Voice khi cần',
  'Ping/chat là chính',
] as const;
const teamGoalOptions = [
  'Leo rank nghiêm túc',
  'Chơi vui, thư giãn',
  'Tìm duo lâu dài',
  'Tìm người phối hợp ổn định',
] as const;

export function HabitSection({
  habits,
  onChange,
  onLimitReached,
}: {
  habits: ProfileEditForm['habits'];
  onChange: (habits: ProfileEditHabitAnswers) => void;
  onLimitReached: () => void;
}) {
  return (
    <ProfileEditSection
      icon="radio-button-on-outline"
      subtitle="Chỉ field thật sự đổi mới được PATCH; câu trả lời chưa có vẫn là unanswered."
      title="Thói quen chơi"
    >
      <ProfileEditStringSingleGroup
        label="Mức độ nghiêm túc"
        onSelect={(seriousness) => onChange({ ...habits, seriousness })}
        options={seriousnessOptions}
        selected={habits.seriousness}
      />
      <ProfileEditStringMultiGroup
        label="Giao tiếp"
        limit={2}
        onToggle={(value) =>
          onChange({
            ...habits,
            communication_channels: toggle(
              habits.communication_channels,
              value,
              2,
              onLimitReached,
            ),
          })
        }
        options={communicationOptions}
        selected={habits.communication_channels}
      />
      <ProfileEditStringMultiGroup
        label="Team goal"
        limit={2}
        onToggle={(value) =>
          onChange({
            ...habits,
            team_goals: toggle(habits.team_goals, value, 2, onLimitReached),
          })
        }
        options={teamGoalOptions}
        selected={habits.team_goals}
      />
    </ProfileEditSection>
  );
}

function toggle(
  current: string[] | undefined,
  value: string,
  limit: number,
  onLimitReached: () => void,
) {
  const values = current ?? [];
  if (values.includes(value)) return values.filter((item) => item !== value);
  if (values.length >= limit) {
    onLimitReached();
    return values;
  }
  return [...values, value];
}
