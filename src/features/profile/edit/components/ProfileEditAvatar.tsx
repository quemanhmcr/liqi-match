import { LinearGradient } from 'expo-linear-gradient';
import { Image, View } from 'react-native';

import { ProfileText } from '../../components/ProfileShared';
import { profileEditStyles as styles } from './profile-edit-styles';

export function ProfileEditAvatar({
  displayName,
  size,
  uri,
}: {
  displayName: string;
  size: number;
  uri?: string;
}) {
  return (
    <LinearGradient
      colors={['rgba(142,92,255,0.76)', 'rgba(103,232,255,0.68)']}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={[
        styles.avatarRing,
        { borderRadius: size / 2 + 4, height: size + 8, width: size + 8 },
      ]}
    >
      <View
        style={[
          styles.avatarInner,
          { borderRadius: size / 2, height: size, width: size },
        ]}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={[styles.avatarImage, { borderRadius: size / 2 }]}
          />
        ) : (
          <ProfileText
            style={[styles.avatarInitial, { fontSize: size * 0.42 }]}
          >
            {displayName.trim().charAt(0).toUpperCase() || 'L'}
          </ProfileText>
        )}
      </View>
    </LinearGradient>
  );
}
