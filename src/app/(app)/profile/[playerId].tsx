import { useLocalSearchParams } from 'expo-router';

import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';

export default function OtherProfileRoute() {
  const { playerId } = useLocalSearchParams<{ playerId?: string | string[] }>();

  return (
    <ProfileScreen
      identityId={Array.isArray(playerId) ? playerId[0] : playerId}
      mode="other"
    />
  );
}
