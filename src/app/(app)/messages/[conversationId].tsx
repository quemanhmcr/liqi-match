import { useLocalSearchParams } from 'expo-router';

import { ChatConversationScreen } from '@/features/messages/screens/ChatConversationScreen';

export default function ChatConversationRoute() {
  const { conversationId } = useLocalSearchParams<{
    conversationId?: string | string[];
  }>();

  return (
    <ChatConversationScreen
      conversationId={
        Array.isArray(conversationId) ? conversationId[0] : conversationId
      }
    />
  );
}
