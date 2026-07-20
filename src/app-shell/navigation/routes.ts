import type { Href } from 'expo-router';

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
      `/discover/matches/${encodeURIComponent(matchId)}` as Href,
    matches: '/discover/matches',
    setDetail: (setId: string) =>
      `/discover/sets/${encodeURIComponent(setId)}` as Href,
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
  social: {
    hub: '/social' as Href,
  },
  sets: {
    create: '/sets/new' as Href,
    detail: (setId: string) =>
      `/discover/sets/${encodeURIComponent(setId)}` as Href,
    edit: (setId: string) => `/sets/${encodeURIComponent(setId)}/edit` as Href,
    hub: '/sets' as Href,
  },
  sessions: {
    conversation: (conversationId: string) =>
      ({
        pathname: '/messages/[conversationId]',
        params: { conversationId },
      }) as const,
    create: '/sessions/new' as Href,
    entry: '/sessions' as Href,
    list: '/sessions' as Href,
    detail: (sessionId: string) =>
      ({
        pathname: '/sessions/[sessionId]',
        params: { sessionId },
      }) as const,
    feedback: (sessionId: string) =>
      ({
        pathname: '/sessions/[sessionId]/feedback',
        params: { sessionId },
      }) as const,
  },
  profile: {
    blocked: '/profile/settings/blocked',
    engagement: '/profile/settings/engagement' as Href,
    gallery: '/profile/gallery' as Href,
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
    reputation: '/profile/reputation' as Href,
    reputationFor: (playerId: string) =>
      `/profile/${encodeURIComponent(playerId)}/reputation` as Href,
    edit: '/profile/edit',
    self: '/profile',
    settings: '/profile/settings',
    share: '/profile/share',
  },
} as const;
