import { describe, expect, it, jest } from '@jest/globals';

import {
  PlayerPrivacyCommandReceiptV2Schema,
  ReportReceiptV2Schema,
  SocialRelationshipCommandReceiptV2Schema,
} from '@/shared/contracts/core-v2';

import type {
  PlayerPrivacyProvider,
  PlayerSafetyCommandService,
  SocialRelationshipCommandService,
} from '../social-relationship-repository';
import { SocialCommandCoordinator } from '../social-command-coordinator';
import { SocialCommandJournal } from '../social-command-journal';
import {
  setSocialTelemetrySink,
  type SocialTelemetryAttributes,
  type SocialTelemetryEvent,
} from '../social-telemetry';

import {
  socialTestSession,
  targetPlayerId,
} from './social-relationship-test-fixtures';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    removeItem: jest.fn(async (key: string) => void values.delete(key)),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

function createServices() {
  return {
    friendship: {
      acceptFriendship:
        jest.fn<SocialRelationshipCommandService['acceptFriendship']>(),
      cancelFriendship:
        jest.fn<SocialRelationshipCommandService['cancelFriendship']>(),
      declineFriendship:
        jest.fn<SocialRelationshipCommandService['declineFriendship']>(),
      removeFriendship:
        jest.fn<SocialRelationshipCommandService['removeFriendship']>(),
      requestFriendship:
        jest.fn<SocialRelationshipCommandService['requestFriendship']>(),
    },
    privacy: {
      getPrivacy: jest.fn<PlayerPrivacyProvider['getPrivacy']>(),
      getTrustVisibility:
        jest.fn<PlayerPrivacyProvider['getTrustVisibility']>(),
      updatePrivacy: jest.fn<PlayerPrivacyProvider['updatePrivacy']>(),
    },
    safety: {
      blockPlayer: jest.fn<PlayerSafetyCommandService['blockPlayer']>(),
      mutePlayer: jest.fn<PlayerSafetyCommandService['mutePlayer']>(),
      reportMessage: jest.fn<PlayerSafetyCommandService['reportMessage']>(),
      reportPlayer: jest.fn<PlayerSafetyCommandService['reportPlayer']>(),
      unblockPlayer: jest.fn<PlayerSafetyCommandService['unblockPlayer']>(),
      unmutePlayer: jest.fn<PlayerSafetyCommandService['unmutePlayer']>(),
    },
  };
}

function relationshipReceipt(command: { correlationId: string }) {
  return SocialRelationshipCommandReceiptV2Schema.parse({
    correlationId: command.correlationId,
    eventIds: ['43000000-0000-4000-8000-000000000020'],
    relationship: {
      block: { targetBlocksViewer: false, viewerBlocksTarget: false },
      capabilities: {
        blocked: false,
        canAcceptFriendship: false,
        canBlock: true,
        canCancelFriendship: true,
        canDeclineFriendship: false,
        canDiscover: true,
        canInviteToSession: false,
        canMessage: false,
        canMute: true,
        canRemoveFriendship: false,
        canReport: true,
        canRequestFriendship: false,
        canUnblock: false,
        canUnmute: false,
        canViewConversation: false,
        canViewPresence: false,
        canViewProfile: true,
        friendshipLabel: 'pending_outgoing' as const,
        muted: false,
      },
      contractVersion: 2 as const,
      friendship: {
        acceptedAt: null,
        label: 'pending_outgoing' as const,
        requestId: '42000000-0000-4000-8000-000000000020',
        requestState: 'pending' as const,
        requestVersion: 1,
        state: 'pending' as const,
      },
      mute: { viewerMutedTarget: false },
      relationshipId: '41000000-0000-4000-8000-000000000020',
      targetPlayerId,
      targetPrivacy: {
        contractVersion: 2 as const,
        friendshipRequests: 'everyone' as const,
        playerId: targetPlayerId,
        presenceVisibility: 'friends' as const,
        profileVisibility: 'everyone' as const,
        sessionInvites: 'friends' as const,
        trustVisibility: 'friends' as const,
        updatedAt: '2026-07-14T15:00:00.000Z',
        version: 1,
      },
      updatedAt: '2026-07-14T15:00:00.000Z',
      version: 1,
      viewerPlayerId: socialTestSession().principal!.playerId,
    },
    repeated: false,
  });
}

function createHarness() {
  const services = createServices();
  const storage = createStorage();
  const journal = new SocialCommandJournal({
    clientPlatform: 'android',
    clientVersion: '2.0.0-test',
    createUuid: () => '43000000-0000-4000-8000-000000000010',
    now: () => new Date('2026-07-14T15:00:00.000Z'),
    storage,
  });
  return {
    coordinator: new SocialCommandCoordinator(services, journal),
    services,
    storage,
  };
}

describe('SocialCommandCoordinator', () => {
  it('keeps the same journaled command after timeout and completes only on success', async () => {
    const { coordinator, services, storage } = createHarness();
    services.friendship.requestFriendship
      .mockRejectedValueOnce(new Error('timeout'))
      .mockImplementationOnce(async (_session, command) =>
        relationshipReceipt(command),
      );
    const input = {
      expectedRelationshipVersion: 0,
      session: socialTestSession(),
      targetPlayerId,
    };

    await expect(coordinator.requestFriendship(input)).rejects.toThrow(
      'timeout',
    );
    expect(storage.removeItem).not.toHaveBeenCalled();

    await expect(coordinator.requestFriendship(input)).resolves.toMatchObject({
      relationship: { friendship: { label: 'pending_outgoing' } },
    });
    expect(services.friendship.requestFriendship).toHaveBeenCalledTimes(2);
    expect(services.friendship.requestFriendship.mock.calls[1]?.[1]).toEqual(
      services.friendship.requestFriendship.mock.calls[0]?.[1],
    );
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
  });

  it('emits privacy-safe command lifecycle telemetry across timeout and replay', async () => {
    const { coordinator, services } = createHarness();
    const events: {
      attributes?: SocialTelemetryAttributes;
      event: SocialTelemetryEvent;
    }[] = [];
    const restore = setSocialTelemetrySink((event, attributes) => {
      events.push({ attributes, event });
    });
    services.friendship.requestFriendship
      .mockRejectedValueOnce(
        Object.assign(new Error('timeout'), {
          code: 'service_unavailable',
          retryable: true,
        }),
      )
      .mockImplementationOnce(async (_session, command) =>
        relationshipReceipt(command),
      );
    const input = {
      expectedRelationshipVersion: 0,
      session: socialTestSession(),
      targetPlayerId,
    };

    try {
      await expect(coordinator.requestFriendship(input)).rejects.toMatchObject({
        code: 'service_unavailable',
      });
      await expect(coordinator.requestFriendship(input)).resolves.toMatchObject(
        {
          relationship: { version: 1 },
        },
      );
    } finally {
      restore();
    }

    expect(events).toEqual([
      {
        attributes: { operation: 'request_friendship' },
        event: 'social.command.started',
      },
      {
        attributes: {
          code: 'service_unavailable',
          operation: 'request_friendship',
          retryable: true,
        },
        event: 'social.command.failed',
      },
      {
        attributes: { operation: 'request_friendship' },
        event: 'social.command.started',
      },
      {
        attributes: {
          aggregateVersion: 1,
          correlationId: '43000000-0000-4000-8000-000000000010',
          operation: 'request_friendship',
          repeated: false,
        },
        event: 'social.command.succeeded',
      },
    ]);
    for (const item of events) {
      expect(Object.keys(item.attributes ?? {})).not.toEqual(
        expect.arrayContaining([
          'accountId',
          'messageId',
          'playerId',
          'reportId',
          'targetPlayerId',
        ]),
      );
    }
  });

  it('does not let a telemetry sink failure change command authority', async () => {
    const { coordinator, services } = createHarness();
    services.friendship.requestFriendship.mockImplementation(
      async (_session, command) => relationshipReceipt(command),
    );
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const restore = setSocialTelemetrySink(() => {
      throw new Error('telemetry unavailable');
    });

    try {
      await expect(
        coordinator.requestFriendship({
          expectedRelationshipVersion: 0,
          session: socialTestSession(),
          targetPlayerId,
        }),
      ).resolves.toMatchObject({ relationship: { version: 1 } });
    } finally {
      restore();
      errorSpy.mockRestore();
    }
  });

  it('rejects a session without canonical account identity before transport', async () => {
    const { coordinator, services } = createHarness();
    const session = {
      ...socialTestSession(),
      principal: undefined,
    };

    await expect(
      coordinator.blockPlayer({
        expectedRelationshipVersion: 0,
        session,
        targetPlayerId,
      }),
    ).rejects.toMatchObject({ code: 'relationship_identity_mismatch' });
    expect(services.safety.blockPlayer).not.toHaveBeenCalled();
  });

  it('routes privacy and report commands through their owned provider ports', async () => {
    const { coordinator, services, storage } = createHarness();
    services.privacy.updatePrivacy.mockResolvedValue(
      PlayerPrivacyCommandReceiptV2Schema.parse({
        correlationId: '43000000-0000-4000-8000-000000000010',
        eventIds: ['43000000-0000-4000-8000-000000000011'],
        privacy: {
          contractVersion: 2,
          friendshipRequests: 'matched_only',
          playerId: socialTestSession().principal!.playerId,
          presenceVisibility: 'hidden',
          profileVisibility: 'friends',
          sessionInvites: 'nobody',
          trustVisibility: 'private',
          updatedAt: '2026-07-14T15:00:00.000Z',
          version: 2,
        },
        repeated: false,
      }),
    );
    services.safety.reportPlayer.mockResolvedValue(
      ReportReceiptV2Schema.parse({
        correlationId: '43000000-0000-4000-8000-000000000010',
        eventIds: ['43000000-0000-4000-8000-000000000012'],
        repeated: false,
        reportId: '45000000-0000-4000-8000-000000000010',
        status: 'submitted',
        version: 1,
      }),
    );

    await coordinator.updatePrivacy({
      expectedPrivacyVersion: 1,
      privacy: {
        friendshipRequests: 'matched_only',
        presenceVisibility: 'hidden',
        profileVisibility: 'friends',
        sessionInvites: 'nobody',
        trustVisibility: 'private',
      },
      session: socialTestSession(),
    });
    await coordinator.reportPlayer({
      category: 'harassment',
      details: 'Unsafe behavior',
      session: socialTestSession(),
      targetPlayerId,
    });

    expect(services.privacy.updatePrivacy).toHaveBeenCalledTimes(1);
    expect(services.safety.reportPlayer).toHaveBeenCalledTimes(1);
    expect(storage.removeItem).toHaveBeenCalledTimes(2);
  });
});
