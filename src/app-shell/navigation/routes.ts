/**
 * Stable public URLs. Feature screens may depend on this contract, while only
 * app-shell owners change URL policy or primary navigation topology.
 */
export const appRoutes = {
  auth: {
    login: '/',
    preview: '/preview',
  },
  main: {
    explore: '/explore',
    home: '/home',
    messages: '/messages',
    profile: '/profile',
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
  profile: {
    blocked: '/profile/settings/blocked',
    detail: (userId: string) =>
      ({ pathname: '/profile/[userId]', params: { userId } }) as const,
    edit: '/profile/edit',
    self: '/profile',
    settings: '/profile/settings',
    share: '/profile/share',
  },
} as const;
