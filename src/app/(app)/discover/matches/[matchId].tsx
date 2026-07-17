import { useLocalSearchParams } from 'expo-router';

import { MatchDetailScreen } from '@/features/discover/screens/MatchDetailScreen';

export default function MatchDetailRoute() {
  const params = useLocalSearchParams<{ matchId?: string | string[] }>();
  return (
    <MatchDetailScreen
      matchId={
        Array.isArray(params.matchId) ? params.matchId[0] : params.matchId
      }
    />
  );
}
