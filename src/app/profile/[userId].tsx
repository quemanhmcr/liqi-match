import { useLocalSearchParams } from 'expo-router';

import { ProfileScreen } from '@/features/profile/ProfileScreen';

export default function OtherProfileRoute() {
  const params = useLocalSearchParams<{ userId?: string | string[] }>();
  const userId = Array.isArray(params.userId) ? params.userId[0] : params.userId;

  return <ProfileScreen mode="other" userId={userId} />;
}
