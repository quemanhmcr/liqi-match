export const playSessionQueryKeys = {
  all: ['core-v2', 'play-sessions'] as const,
  current: () => ['core-v2', 'play-sessions', 'current'] as const,
  detail: (sessionId: string) =>
    ['core-v2', 'play-sessions', 'detail', sessionId] as const,
  invites: () => ['core-v2', 'play-sessions', 'invites'] as const,
};
