import { useLocalSearchParams } from 'expo-router';

import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';

export default function OtherProfileRoute() {
  const { userId } = useLocalSearchParams<{ userId?: string | string[] }>();

  return (
    <ProfileScreen
      mode="other"
      userId={Array.isArray(userId) ? userId[0] : userId}
    />
  );
}
