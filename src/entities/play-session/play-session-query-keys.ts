export const playSessionQueryKeys = {
  all: ['core-v2', 'play-sessions'] as const,
  current: (playerId: string) =>
    ['core-v2', 'play-sessions', 'player', playerId, 'current'] as const,
  detail: (playerId: string, sessionId: string) =>
    [
      'core-v2',
      'play-sessions',
      'player',
      playerId,
      'detail',
      sessionId,
    ] as const,
  invites: (playerId: string) =>
    ['core-v2', 'play-sessions', 'player', playerId, 'invites'] as const,
};
