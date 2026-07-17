import { useLocalSearchParams } from 'expo-router';
import { ReputationLedgerScreen } from '@/features/trust-outcomes/screens/ReputationLedgerScreen';
export default function PlayerReputationRoute() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  return <ReputationLedgerScreen playerId={playerId} />;
}
