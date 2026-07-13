import { TextInput } from 'react-native';

import { ProfileText } from '../../components/ProfileShared';
import type { ProfileReferenceOption } from '../../services/profile-service';
import type { ProfileEditGameProfile } from '../model/profile-edit-model';
import {
  ProfileEditFieldLabel,
  ProfileEditOptionGroup,
  ProfileEditSection,
} from './ProfileEditPrimitives';
import { profileEditStyles as styles } from './profile-edit-styles';

export function GameProfileSection({
  gameProfile,
  hasGameProfileRecord,
  onChange,
  ranks,
}: {
  gameProfile: ProfileEditGameProfile;
  hasGameProfileRecord: boolean;
  onChange: (gameProfile: ProfileEditGameProfile) => void;
  ranks: ProfileReferenceOption[];
}) {
  return (
    <ProfileEditSection
      icon="game-controller-outline"
      subtitle="Game handle và rank được lưu riêng; region không còn là field có thể chỉnh."
      title="Hồ sơ game"
    >
      {!hasGameProfileRecord ? (
        <ProfileText style={styles.errorText}>
          Chưa có game profile trên server. Màn hình này sẽ không tự tạo handle
          hoặc region giả; các phần hồ sơ khác vẫn có thể lưu độc lập.
        </ProfileText>
      ) : null}
      <ProfileEditFieldLabel
        label="Game handle"
        meta="không dùng tên hiển thị thay thế"
      />
      <TextInput
        accessibilityLabel="Game handle"
        editable={hasGameProfileRecord}
        maxLength={64}
        onChangeText={(handle) => onChange({ ...gameProfile, handle })}
        placeholder="Tên trong game"
        placeholderTextColor="rgba(215,224,255,0.36)"
        style={styles.input}
        value={gameProfile.handle}
      />
      <ProfileEditOptionGroup
        label="Cấp độ"
        onSelect={(rankId) => onChange({ ...gameProfile, rankId })}
        options={ranks}
        selectedId={gameProfile.rankId}
      />
    </ProfileEditSection>
  );
}
