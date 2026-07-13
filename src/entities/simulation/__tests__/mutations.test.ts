import { describe, expect, it } from '@jest/globals';

import {
  GOLDEN_CONVERSATION_IDS,
  GOLDEN_PROFILE_IDS,
  GOLDEN_SET_IDS,
  GOLDEN_WORLD,
  SimulationDomainMutationError,
  SimulationWorldSnapshotSchema,
  changeSimulationSetMembership,
  inviteSimulationPlayerToSet,
  markSimulationConversationRead,
  markSimulationNotificationsSeenThrough,
  messageId,
  notificationId,
  requestSimulationSetJoin,
  simulationIsoMinutesAfter,
  transitionSimulationMessageDelivery,
} from '@/entities/simulation';

describe('Messages and Notifications domain mutation lenses', () => {
  it('moves read watermarks only forward and derives delivery read state', () => {
    const world = SimulationWorldSnapshotSchema.parse(GOLDEN_WORLD);
    const now = '2026-07-13T02:01:00.000Z';
    const throughMessageId = messageId('message:khoa-jungle:5');

    markSimulationConversationRead(world, {
      conversationId: GOLDEN_CONVERSATION_IDS.khoaJungle,
      now,
      profileId: GOLDEN_PROFILE_IDS.quanViewer,
      throughMessageId,
    });

    expect(
      world.conversations[GOLDEN_CONVERSATION_IDS.khoaJungle]?.memberState[
        GOLDEN_PROFILE_IDS.quanViewer
      ]?.lastReadMessageId,
    ).toBe(throughMessageId);
    expect(world.messages[throughMessageId]?.deliveryStatus).toBe('read');
  });

  it('marks notifications through a canonical timestamp/id watermark', () => {
    const world = SimulationWorldSnapshotSchema.parse(GOLDEN_WORLD);
    const watermarkId = notificationId('notification:minh-anh-message');
    const watermark = world.notifications[watermarkId];
    if (!watermark) throw new Error('Missing notification watermark.');

    const changed = markSimulationNotificationsSeenThrough(world, {
      now: '2026-07-13T02:01:00.000Z',
      profileId: GOLDEN_PROFILE_IDS.quanViewer,
      seenThrough: { id: watermark.id, occurredAt: watermark.occurredAt },
    });

    expect(changed).toBe(3);
    expect(world.notifications[watermarkId]?.seenAt).toBe(
      '2026-07-13T02:01:00.000Z',
    );
  });

  it('rejects a notification watermark owned by another recipient', () => {
    const world = SimulationWorldSnapshotSchema.parse(GOLDEN_WORLD);
    const otherNotificationId = notificationId(
      'notification:dem-violet-invite-pending',
    );
    const other = world.notifications[otherNotificationId];
    if (!other) throw new Error('Missing other-recipient notification.');

    expect(() =>
      markSimulationNotificationsSeenThrough(world, {
        now: '2026-07-13T02:01:00.000Z',
        profileId: GOLDEN_PROFILE_IDS.quanViewer,
        seenThrough: { id: other.id, occurredAt: other.occurredAt },
      }),
    ).toThrow(/does not belong/);
  });

  it('stores discover join requests and invites in the canonical set graph', () => {
    const world = SimulationWorldSnapshotSchema.parse(GOLDEN_WORLD);
    const requestedAt = simulationIsoMinutesAfter(world.generatedAt, 1);

    const request = requestSimulationSetJoin(world, {
      now: requestedAt,
      profileId: GOLDEN_PROFILE_IDS.maiSupport,
      setId: GOLDEN_SET_IDS.macroLab,
    });
    expect(request.repeated).toBe(false);
    expect(
      world.sets[GOLDEN_SET_IDS.macroLab]?.joinRequests[
        GOLDEN_PROFILE_IDS.maiSupport
      ],
    ).toBe('pending');

    const invite = inviteSimulationPlayerToSet(world, {
      actorId: GOLDEN_PROFILE_IDS.quanViewer,
      now: simulationIsoMinutesAfter(requestedAt, 1),
      profileId: GOLDEN_PROFILE_IDS.anMage,
      setId: GOLDEN_SET_IDS.demViolet,
    });
    expect(invite.repeated).toBe(false);
    expect(
      world.sets[GOLDEN_SET_IDS.demViolet]?.invites[GOLDEN_PROFILE_IDS.anMage],
    ).toBe('pending');
  });

  it('joins and leaves sets through explicit membership transitions', () => {
    const world = SimulationWorldSnapshotSchema.parse(GOLDEN_WORLD);
    const joinedAt = simulationIsoMinutesAfter(world.generatedAt, 1);

    changeSimulationSetMembership(world, {
      membership: 'joined',
      now: joinedAt,
      profileId: GOLDEN_PROFILE_IDS.quanViewer,
      setId: GOLDEN_SET_IDS.macroLab,
    });
    expect(world.sets[GOLDEN_SET_IDS.macroLab]?.memberIds).toContain(
      GOLDEN_PROFILE_IDS.quanViewer,
    );
    expect(
      world.sets[GOLDEN_SET_IDS.macroLab]?.joinRequests[
        GOLDEN_PROFILE_IDS.quanViewer
      ],
    ).toBeUndefined();

    changeSimulationSetMembership(world, {
      membership: 'left',
      now: simulationIsoMinutesAfter(joinedAt, 1),
      profileId: GOLDEN_PROFILE_IDS.quanViewer,
      setId: GOLDEN_SET_IDS.macroLab,
    });
    expect(world.sets[GOLDEN_SET_IDS.macroLab]?.memberIds).not.toContain(
      GOLDEN_PROFILE_IDS.quanViewer,
    );
  });

  it('rejects invalid message delivery transitions', () => {
    const world = SimulationWorldSnapshotSchema.parse(GOLDEN_WORLD);

    expect(() =>
      transitionSimulationMessageDelivery(world, {
        messageId: messageId('message:khoa-jungle:5'),
        nextStatus: 'queued',
        now: '2026-07-13T02:01:00.000Z',
      }),
    ).toThrow(SimulationDomainMutationError);
  });
});
