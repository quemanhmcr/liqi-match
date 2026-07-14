import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import { Alert } from 'react-native';

import {
  BlockedPlayerListPageV2Schema,
  type SocialRelationshipSnapshotV2,
} from '@/shared/contracts/core-v2';
import { renderWithProviders } from '@/test/render-with-providers';

import { ProfileBlockedUsersScreen } from '../screens/ProfileBlockedUsersScreen';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  digestStringAsync: jest.fn(async () => 'a'.repeat(64)),
  randomUUID: jest.fn(() => '43000000-0000-4000-8000-000000001255'),
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}));

const fixtureRoot = path.join(
  process.cwd(),
  'contracts/core-v2/fixtures/provider',
);
const blockedPage = BlockedPlayerListPageV2Schema.parse(
  JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, 'blocked-player-page.json'), 'utf8'),
  ),
);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ProfileBlockedUsersScreen', () => {
  it('unblocks through the V2 command coordinator with the listed relationship version', async () => {
    const unblockPlayer = jest.fn(async (_session: unknown, command: any) => ({
      correlationId: command.correlationId,
      eventIds: ['43000000-0000-4000-8000-000000001256'],
      relationship: unblockedRelationship(blockedPage.items[0]!.relationship),
      repeated: false,
    }));
    const runtime = createRelationshipRuntime({ unblockPlayer });
    jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) => {
        buttons?.find((button) => button.text === 'Gỡ chặn')?.onPress?.();
      });
    const screen = await renderWithProviders(<ProfileBlockedUsersScreen />, {
      serviceOverrides: { relationshipRepository: runtime },
    });

    expect(await screen.findByText('Blocked Player')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Gỡ chặn Blocked Player'));

    await waitFor(() => expect(unblockPlayer).toHaveBeenCalledTimes(1));
    expect(unblockPlayer.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        expectedRelationshipVersion: 3,
        targetPlayerId: '20000000-0000-4000-8000-000000000002',
      }),
    );
  });
});

function createRelationshipRuntime(overrides: Record<string, unknown>) {
  const unused = jest.fn(async () => {
    throw new Error(
      'Unexpected social operation in blocked-list consumer test.',
    );
  });
  return {
    acceptFriendship: unused,
    blockPlayer: unused,
    cancelFriendship: unused,
    declineFriendship: unused,
    getPrivacy: unused,
    getRelationship: unused,
    getTrustVisibility: unused,
    listBlockedPlayers: jest.fn(async () => blockedPage),
    listFriendships: unused,
    mutePlayer: unused,
    removeFriendship: unused,
    reportMessage: unused,
    reportPlayer: unused,
    requestFriendship: unused,
    unblockPlayer: unused,
    unmutePlayer: unused,
    updatePrivacy: unused,
    ...overrides,
  } as never;
}

function unblockedRelationship(
  relationship: SocialRelationshipSnapshotV2,
): SocialRelationshipSnapshotV2 {
  return {
    ...relationship,
    block: {
      ...relationship.block,
      viewerBlocksTarget: false,
    },
    capabilities: {
      ...relationship.capabilities,
      blocked: false,
      canBlock: true,
      canDiscover: true,
      canMute: true,
      canRequestFriendship: true,
      canUnblock: false,
      canViewProfile: true,
    },
    updatedAt: '2026-07-14T16:10:00.000Z',
    version: relationship.version + 1,
  };
}
