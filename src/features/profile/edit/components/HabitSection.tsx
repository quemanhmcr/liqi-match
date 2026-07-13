import {
  COMEBACK_RESPONSE_CATALOG,
  COMMUNICATION_PREFERENCE_CATALOG,
  DECISION_STYLE_CATALOG,
  FEEDBACK_STYLE_CATALOG,
  LOSS_RESPONSE_CATALOG,
  PROFILE_LIMITS,
  SERIOUSNESS_CATALOG,
  SESSION_LENGTH_CATALOG,
  STRATEGY_STYLE_CATALOG,
  TEAM_ATMOSPHERE_CATALOG,
  TEAM_GOAL_CATALOG,
  type HabitAnswersDraft,
} from '@/entities/player-profile';

import type { ProfileEditForm } from '../model/profile-edit-model';
import {
  ProfileEditCatalogMultiGroup,
  ProfileEditCatalogSingleGroup,
  ProfileEditSection,
} from './ProfileEditPrimitives';

export function HabitSection({
  habits,
  onChange,
  onLimitReached,
}: {
  habits: ProfileEditForm['habits'];
  onChange: (habits: HabitAnswersDraft) => void;
  onLimitReached: () => void;
}) {
  return (
    <ProfileEditSection
      icon="radio-button-on-outline"
      subtitle="Form chỉ giữ canonical IDs. Chỉ câu trả lời thực sự đổi mới được map về legacy value và PATCH."
      title="Thói quen chơi"
    >
      <ProfileEditCatalogSingleGroup
        label="Mức độ nghiêm túc"
        onSelect={(seriousnessId) => onChange({ ...habits, seriousnessId })}
        options={SERIOUSNESS_CATALOG}
        selectedId={habits.seriousnessId}
      />
      <ProfileEditCatalogMultiGroup
        label="Giao tiếp"
        limit={PROFILE_LIMITS.communicationPreferences}
        onToggle={(id) =>
          onChange({
            ...habits,
            communicationPreferenceIds: toggle(
              habits.communicationPreferenceIds,
              id,
              PROFILE_LIMITS.communicationPreferences,
              onLimitReached,
            ),
          })
        }
        options={COMMUNICATION_PREFERENCE_CATALOG}
        selectedIds={habits.communicationPreferenceIds}
      />
      <ProfileEditCatalogSingleGroup
        label="Ra quyết định"
        onSelect={(decisionStyleId) => onChange({ ...habits, decisionStyleId })}
        options={DECISION_STYLE_CATALOG}
        selectedId={habits.decisionStyleId}
      />
      <ProfileEditCatalogSingleGroup
        label="Độ dài phiên"
        onSelect={(sessionLengthId) => onChange({ ...habits, sessionLengthId })}
        options={SESSION_LENGTH_CATALOG}
        selectedId={habits.sessionLengthId}
      />
      <ProfileEditCatalogMultiGroup
        label="Team goal"
        limit={PROFILE_LIMITS.teamGoals}
        onToggle={(id) =>
          onChange({
            ...habits,
            teamGoalIds: toggle(
              habits.teamGoalIds,
              id,
              PROFILE_LIMITS.teamGoals,
              onLimitReached,
            ),
          })
        }
        options={TEAM_GOAL_CATALOG}
        selectedIds={habits.teamGoalIds}
      />
      <ProfileEditCatalogMultiGroup
        label="Chiến thuật"
        limit={PROFILE_LIMITS.strategyStyles}
        onToggle={(id) =>
          onChange({
            ...habits,
            strategyStyleIds: toggle(
              habits.strategyStyleIds,
              id,
              PROFILE_LIMITS.strategyStyles,
              onLimitReached,
            ),
          })
        }
        options={STRATEGY_STYLE_CATALOG}
        selectedIds={habits.strategyStyleIds}
      />
      <ProfileEditCatalogMultiGroup
        label="Không khí đội"
        limit={PROFILE_LIMITS.teamAtmospheres}
        onToggle={(id) =>
          onChange({
            ...habits,
            teamAtmosphereIds: toggle(
              habits.teamAtmosphereIds,
              id,
              PROFILE_LIMITS.teamAtmospheres,
              onLimitReached,
            ),
          })
        }
        options={TEAM_ATMOSPHERE_CATALOG}
        selectedIds={habits.teamAtmosphereIds}
      />
      <ProfileEditCatalogSingleGroup
        label="Cách góp ý"
        onSelect={(feedbackStyleId) => onChange({ ...habits, feedbackStyleId })}
        options={FEEDBACK_STYLE_CATALOG}
        selectedId={habits.feedbackStyleId}
      />
      <ProfileEditCatalogSingleGroup
        label="Sau trận thua"
        onSelect={(lossResponseId) => onChange({ ...habits, lossResponseId })}
        options={LOSS_RESPONSE_CATALOG}
        selectedId={habits.lossResponseId}
      />
      <ProfileEditCatalogSingleGroup
        label="Khi bị dẫn trước"
        onSelect={(comebackResponseId) =>
          onChange({ ...habits, comebackResponseId })
        }
        options={COMEBACK_RESPONSE_CATALOG}
        selectedId={habits.comebackResponseId}
      />
    </ProfileEditSection>
  );
}

function toggle<Id extends string>(
  current: readonly Id[],
  value: Id,
  limit: number,
  onLimitReached: () => void,
): Id[] {
  if (current.includes(value)) return current.filter((item) => item !== value);
  if (current.length >= limit) {
    onLimitReached();
    return [...current];
  }
  return [...current, value];
}
