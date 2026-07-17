import { useLocalSearchParams } from 'expo-router';
import { MatchSetEditorScreen } from '@/features/match-set/screens/MatchSetEditorScreen';
export default function EditSetRoute() {
  const params = useLocalSearchParams<{ setId?: string | string[] }>();
  return (
    <MatchSetEditorScreen
      setId={Array.isArray(params.setId) ? params.setId[0] : params.setId}
    />
  );
}
