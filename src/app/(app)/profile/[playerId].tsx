import { useLocalSearchParams } from 'expo-router';

import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';

export default function OtherProfileRoute() {
  const { playerId } = useLocalSearchParams<{ playerId?: string | string[] }>();

  return (
    <ProfileScreen
      mode="other"
      identityId={Array.isArray(playerId) ? playerId[0] : playerId}
    />
  );
}
