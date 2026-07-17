import { Redirect, useLocalSearchParams } from 'expo-router';

import { appRoutes } from '@/app-shell/navigation/routes';
import { ConversationIdSchema } from '@/shared/contracts/core-v1';

export function LegacySessionConversationRedirectScreen() {
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const parsed = ConversationIdSchema.safeParse(params.conversationId);
  return (
    <Redirect
      href={
        parsed.success
          ? appRoutes.messages.detail(parsed.data)
          : appRoutes.main.messages
      }
    />
  );
}
