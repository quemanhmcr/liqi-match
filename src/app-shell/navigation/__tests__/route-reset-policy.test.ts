import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

const appRoot = 'src/app/(app)';

const preservedAdapters = new Map([
  [
    'src/app/(app)/(tabs)/home.tsx',
    '@/features/home/screens/HomeDashboardScreen',
  ],
  [
    'src/app/(app)/(tabs)/messages.tsx',
    '@/features/messages/screens/MessagesScreen',
  ],
  [
    'src/app/(app)/messages/[conversationId].tsx',
    '@/features/messages/screens/ChatConversationScreen',
  ],
  [
    'src/app/(app)/sessions/conversations/[conversationId].tsx',
    '@/features/messages/screens/LegacySessionConversationRedirectScreen',
  ],
]);

const resetAdapters = new Map([
  ['src/app/(app)/(tabs)/explore.tsx', 'explore'],
  ['src/app/(app)/(tabs)/profile.tsx', 'profile'],
  ['src/app/(app)/discover/matches.tsx', 'discover-matches'],
  ['src/app/(app)/discover/matches/[matchId].tsx', 'discover-match-detail'],
  ['src/app/(app)/discover/sets.tsx', 'discover-sets'],
  ['src/app/(app)/discover/sets/[setId].tsx', 'discover-set-detail'],
  ['src/app/(app)/discover/vibes.tsx', 'discover-vibes'],
  ['src/app/(app)/notifications.tsx', 'notifications'],
  ['src/app/(app)/profile/[playerId].tsx', 'profile-player'],
  [
    'src/app/(app)/profile/[playerId]/reputation/index.tsx',
    'profile-player-reputation',
  ],
  ['src/app/(app)/profile/edit.tsx', 'profile-edit'],
  ['src/app/(app)/profile/gallery/index.tsx', 'profile-gallery'],
  ['src/app/(app)/profile/reputation/index.tsx', 'profile-reputation'],
  ['src/app/(app)/profile/settings.tsx', 'profile-settings'],
  ['src/app/(app)/profile/settings/blocked.tsx', 'profile-blocked'],
  ['src/app/(app)/profile/settings/engagement/index.tsx', 'profile-engagement'],
  ['src/app/(app)/profile/share.tsx', 'profile-share'],
  ['src/app/(app)/sessions/[sessionId].tsx', 'session-detail'],
  ['src/app/(app)/sessions/[sessionId]/feedback.tsx', 'session-feedback'],
  ['src/app/(app)/sessions/index.tsx', 'sessions'],
  ['src/app/(app)/sessions/new.tsx', 'session-create'],
  ['src/app/(app)/sets/[setId]/edit.tsx', 'set-edit'],
  ['src/app/(app)/sets/index.tsx', 'sets'],
  ['src/app/(app)/sets/new.tsx', 'set-create'],
  ['src/app/(app)/social/index.tsx', 'social'],
]);

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

function routeAdapters(directory: string): string[] {
  return fs
    .readdirSync(path.resolve(process.cwd(), directory), {
      withFileTypes: true,
    })
    .flatMap((entry) => {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return routeAdapters(relative);
      if (!entry.name.endsWith('.tsx') || entry.name === '_layout.tsx')
        return [];
      return [relative];
    });
}

describe('authenticated product route reset policy', () => {
  it('keeps only Home and Messages authority adapters mounted', () => {
    for (const [file, authorityImport] of preservedAdapters) {
      const source = read(file);
      expect(source).toContain(authorityImport);
      expect(source).not.toContain('ResetRouteScreen');
    }
  });

  it('mounts every other authenticated product route through the blank host', () => {
    for (const [file, routeId] of resetAdapters) {
      const source = read(file);
      expect(source).toContain('ResetRouteScreen');
      expect(source).toContain(`routeId="${routeId}"`);
      expect(source).not.toContain("from '@/features/");
    }
  });

  it('requires every authenticated route adapter to be classified', () => {
    const classified = new Set([
      ...preservedAdapters.keys(),
      ...resetAdapters.keys(),
    ]);
    expect(routeAdapters(appRoot).sort()).toEqual([...classified].sort());
    expect(resetAdapters.size).toBe(25);
  });
});
