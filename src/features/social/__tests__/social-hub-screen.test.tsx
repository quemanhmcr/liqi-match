import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { InMemorySocialRelationshipRepository } from '@/entities/social-relationship';
import { SocialRelationshipSnapshotV2Schema } from '@/shared/contracts/core-v2';
import {
  renderWithProviders,
  testPlayerId,
} from '@/test/render-with-providers';

import { SocialHubScreen } from '../screens/SocialHubScreen';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    push: (...args: unknown[]) => mockPush(...args),
  },
}));

function relationship(
  label: 'friend' | 'pending_incoming' | 'pending_outgoing',
  targetPlayerId: string,
  suffix: string,
) {
  const friend = label === 'friend';
  const incoming = label === 'pending_incoming';
  const pending = !friend;
  return SocialRelationshipSnapshotV2Schema.parse({
    block: { targetBlocksViewer: false, viewerBlocksTarget: false },
    capabilities: {
      blocked: false,
      canAcceptFriendship: incoming,
      canBlock: true,
      canCancelFriendship: label === 'pending_outgoing',
      canDeclineFriendship: incoming,
      canDiscover: true,
      canInviteToSession: friend,
      canMessage: friend,
      canMute: true,
      canRemoveFriendship: friend,
      canReport: true,
      canRequestFriendship: false,
      canUnblock: false,
      canUnmute: false,
      canViewConversation: friend,
      canViewPresence: friend,
      canViewProfile: true,
      friendshipLabel: label,
      muted: false,
    },
    contractVersion: 2,
    friendship: {
      acceptedAt: friend ? '2026-07-14T10:00:00.000Z' : null,
      label,
      requestId: `42000000-0000-4000-8000-${suffix}`,
      requestState: friend ? 'accepted' : 'pending',
      requestVersion: pending ? 1 : 2,
      state: friend ? 'accepted' : 'pending',
    },
    mute: { viewerMutedTarget: false },
    relationshipId: `41000000-0000-4000-8000-${suffix}`,
    targetPlayerId,
    targetPrivacy: {
      contractVersion: 2,
      friendshipRequests: 'everyone',
      playerId: targetPlayerId,
      presenceVisibility: 'friends',
      profileVisibility: 'friends',
      sessionInvites: 'friends',
      trustVisibility: 'friends',
      updatedAt: '2026-07-14T09:00:00.000Z',
      version: 1,
    },
    updatedAt: '2026-07-14T10:00:00.000Z',
    version: friend ? 2 : 1,
    viewerPlayerId: testPlayerId,
  });
}

beforeEach(() => {
  mockBack.mockClear();
  mockPush.mockClear();
});

describe('SocialHubScreen', () => {
  it('renders accepted, incoming and outgoing authority tabs', async () => {
    const relationshipRepository = new InMemorySocialRelationshipRepository({
      relationships: [
        relationship(
          'friend',
          '20000000-0000-4000-8000-000000000002',
          '000000000002',
        ),
        relationship(
          'pending_incoming',
          '20000000-0000-4000-8000-000000000003',
          '000000000003',
        ),
        relationship(
          'pending_outgoing',
          '20000000-0000-4000-8000-000000000004',
          '000000000004',
        ),
      ],
    });
    const screen = await renderWithProviders(<SocialHubScreen />, {
      serviceOverrides: { relationshipRepository },
    });

    expect(await screen.findByText('Bạn bè & lời mời')).toBeTruthy();
    expect(screen.getByLabelText('Bạn bè, 1 mục')).toBeTruthy();
    expect(screen.getByLabelText('Đang chờ bạn, 1 mục')).toBeTruthy();
    expect(screen.getByLabelText('Đã gửi, 1 mục')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Đang chờ bạn, 1 mục'));
    await waitFor(() => expect(screen.getByText('Chấp nhận')).toBeTruthy());
    expect(screen.getByText('Từ chối')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Đã gửi, 1 mục'));
    await waitFor(() => expect(screen.getByText('Thu hồi')).toBeTruthy());
  });
});
