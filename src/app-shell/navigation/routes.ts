/**
 * Stable public URLs. Feature screens may depend on this contract, while only
 * app-shell owners change URL policy or primary navigation topology.
 */
export const appRoutes = {
  auth: {
    login: '/',
    preview: '/preview',
  },
  discover: {
    matchDetail: (matchId: string) =>
      ({ pathname: '/discover/matches', params: { matchId } }) as const,
    matches: '/discover/matches',
    setDetail: (setId: string) =>
      ({ pathname: '/discover/sets', params: { setId } }) as const,
    sets: '/discover/sets',
    vibes: '/discover/vibes',
  },
  main: {
    explore: '/explore',
    home: '/home',
    messages: '/messages',
    profile: '/profile',
  },
  messages: {
    detail: (conversationId: string) =>
      ({
        pathname: '/messages/[conversationId]',
        params: { conversationId },
      }) as const,
  },
  onboarding: {
    habits: '/habits',
    heroSelection: '/hero-selection',
    lane: '/lane',
    profileMedia: '/profile-media',
    profileSetup: '/profile-setup',
    rank: '/rank',
  },
  notifications: '/notifications',
  sessions: {
    conversation: (conversationId: string) =>
      ({
        pathname: '/sessions/conversations/[conversationId]',
        params: { conversationId },
      }) as const,
    create: '/sessions/new',
    detail: (sessionId: string) =>
      ({
        pathname: '/sessions/[sessionId]',
        params: { sessionId },
      }) as const,
    list: '/sessions',
  },
  profile: {
    blocked: '/profile/settings/blocked',
    detail: (identityId: string) =>
      ({
        pathname: '/profile/[playerId]',
        params: { playerId: identityId },
      }) as const,
    playerDetail: (playerId: string) =>
      ({
        pathname: '/profile/[playerId]',
        params: { playerId },
      }) as const,
    edit: '/profile/edit',
    self: '/profile',
    settings: '/profile/settings',
    share: '/profile/share',
  },
} as const;
