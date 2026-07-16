import { useLocalSearchParams } from 'expo-router';

import { SessionFeedbackScreen } from '@/features/trust-outcomes/screens/SessionFeedbackScreen';

export default function SessionFeedbackRoute() {
  const { sessionId } = useLocalSearchParams<{
    sessionId?: string | string[];
  }>();
  const resolved = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  return <SessionFeedbackScreen sessionId={resolved ?? ''} />;
}
