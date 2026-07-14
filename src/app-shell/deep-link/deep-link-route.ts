import type { Href } from 'expo-router';

import type { DeepLinkV1 } from '@/shared/contracts/core-v1';
import { appRoutes } from '@/app-shell/navigation/routes';

export function routeForDeepLinkV1(deepLink: DeepLinkV1): Href {
  switch (deepLink.target) {
    case 'conversation':
      return appRoutes.messages.detail(deepLink.conversationId);
    case 'match':
      return appRoutes.discover.matchDetail(deepLink.matchId);
    case 'profile':
      return appRoutes.profile.playerDetail(deepLink.playerId);
    case 'set':
      return appRoutes.discover.setDetail(deepLink.setId);
    case 'session_feedback':
      return appRoutes.trust.feedback(deepLink.sessionId);
    case 'home':
      return appRoutes.main.home;
  }
}
