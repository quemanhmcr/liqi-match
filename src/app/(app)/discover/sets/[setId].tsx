import { useLocalSearchParams } from 'expo-router';

import { MatchSetDetailScreen } from '@/features/discover/screens/MatchSetDetailScreen';

export default function MatchSetDetailRoute() {
  const params = useLocalSearchParams<{ setId?: string | string[] }>();
  return (
    <MatchSetDetailScreen
      setId={Array.isArray(params.setId) ? params.setId[0] : params.setId}
    />
  );
}
