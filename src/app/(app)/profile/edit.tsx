import { useLocalSearchParams } from 'expo-router';

import { ProfileEditScreen } from '@/features/profile/screens/ProfileEditScreen';

export default function ProfileEditRoute() {
  const params = useLocalSearchParams<{ category?: string | string[] }>();
  const category = Array.isArray(params.category)
    ? params.category[0]
    : params.category;
  const initialCategory =
    category === 'game' ||
    category === 'playStyle' ||
    category === 'availability'
      ? category
      : 'identity';

  return <ProfileEditScreen initialCategory={initialCategory} />;
}
