import { describe, expect, it } from '@jest/globals';

import {
  changeSimulationSetMembership,
  GOLDEN_CONVERSATION_IDS,
  GOLDEN_PROFILE_IDS,
  SIMULATION_RUNTIME_OPERATIONS,
} from '@/entities/simulation';
import { createProductionSimulationHarness } from '@/test/production-simulation-harness';

const playerListParams = {
  cursor: undefined,
  facetIds: [],
  limit: 50,
  query: '',
  sort: 'best_match' as const,
};

const setListParams = {
  cursor: undefined,
  facetIds: [],
  limit: 50,
  query: '',
  sort: 'best_match' as const,
};

describe('Production Simulation cross-feature acceptance', () => {
  it('Flow A keeps one actor and conversation across Discover, Profile and Messages', async () => {
    const harness = createProductionSimulationHarness('acceptance-flow-a');
    const discover = await harness.services.discoverRepository.listPlayers(
      harness.discoverContext,
      playerListParams,
    );
    const actor = discover.data.items.find(
      (item) => item.profileId === GOLDEN_PROFILE_IDS.minhAnh,
    );
    expect(actor).toBeDefined();
    if (!actor?.conversationId) return;

    const profile = await harness.services.profileRepository.getProfile({
      session: harness.session,
      userId: actor.profileId,
    });
    const conversation =
      await harness.services.messageRepository.getConversation(
        actor.conversationId,
        harness.discoverContext,
      );

    expect(profile).toMatchObject({
      avatarAssetKey:
        actor.avatar.kind === 'fixture' ? actor.avatar.assetKey : undefined,
      conversationId: actor.conversationId,
      displayName: actor.displayName,
      id: actor.profileId,
    });
    expect(conversation?.data.id).toBe(actor.conversationId);
    expect(
      conversation?.data.members.some(
        (member) =>
          member.id === actor.profileId &&
          member.displayName === actor.displayName,
      ),
    ).toBe(true);
  });

  it('Flow C propagates a current-profile update through Home, Profile and Discover projections', async () => {
    const harness = createProductionSimulationHarness('acceptance-flow-c');
    const beforeDiscover =
      await harness.services.discoverRepository.listPlayers(
        harness.discoverContext,
        playerListParams,
      );
    const beforeActor = beforeDiscover.data.items.find(
      (item) => item.profileId === GOLDEN_PROFILE_IDS.minhAnh,
    );
    expect(beforeActor).toBeDefined();

    await harness.services.simulationRuntime.mutate(
      {
        operation: SIMULATION_RUNTIME_OPERATIONS.updateProfile,
        scope: GOLDEN_PROFILE_IDS.quanViewer,
      },
      (world, context) => {
        const viewer = world.profiles[GOLDEN_PROFILE_IDS.quanViewer]!;
        viewer.canonicalProfile.profileBasics.displayName = 'Quân Updated';
        if (!viewer.facets.includes('soulmate')) viewer.facets.push('soulmate');
        viewer.updatedAt = context.clock.now().toISOString();
      },
    );

    const [home, profile, afterDiscover] = await Promise.all([
      harness.services.homeRepository.getDashboard(harness.session),
      harness.services.profileRepository.getProfile({
        session: harness.session,
      }),
      harness.services.discoverRepository.listPlayers(
        harness.discoverContext,
        playerListParams,
      ),
    ]);
    const afterActor = afterDiscover.data.items.find(
      (item) => item.profileId === GOLDEN_PROFILE_IDS.minhAnh,
    );

    expect(home.currentProfile.displayName).toBe('Quân Updated');
    expect(profile?.displayName).toBe('Quân Updated');
    expect(
      afterDiscover.data.items.some(
        (item) => item.profileId === GOLDEN_PROFILE_IDS.quanViewer,
      ),
    ).toBe(false);
    expect(afterActor?.matchScore).toBeGreaterThan(
      beforeActor?.matchScore ?? 0,
    );
  });

  it('Flow D joins the set referenced by a notification and reset restores baseline membership', async () => {
    const harness = createProductionSimulationHarness('acceptance-flow-d');
    const notificationPage = await harness.services.notificationRepository.list(
      {
        limit: 50,
        session: harness.session,
      },
    );
    const invite = notificationPage.items.find(
      (item) => item.kind === 'set-invite',
    );
    if (invite?.kind !== 'set-invite') {
      throw new Error('Expected a canonical set invite.');
    }
    const baseline = harness.services.simulationRuntime.readWorld();
    expect(
      baseline.sets[invite.payload.setId as never]?.memberIds,
    ).not.toContain(GOLDEN_PROFILE_IDS.quanViewer);

    await harness.services.simulationRuntime.mutate(
      {
        operation: SIMULATION_RUNTIME_OPERATIONS.joinSet,
        scope: invite.payload.setId,
      },
      (world, context) =>
        changeSimulationSetMembership(world, {
          membership: 'joined',
          now: context.clock.now().toISOString(),
          profileId: world.viewerId,
          setId: invite.payload.setId as never,
        }),
    );

    const joinedSets = await harness.services.discoverRepository.listSets(
      harness.discoverContext,
      setListParams,
    );
    expect(
      joinedSets.data.items.find((set) => set.id === invite.payload.setId)
        ?.viewerState.relationship,
    ).toBe('member');

    await harness.services.simulationRuntime.reset();
    const resetSets = await harness.services.discoverRepository.listSets(
      harness.discoverContext,
      setListParams,
    );
    expect(
      resetSets.data.items.find((set) => set.id === invite.payload.setId)
        ?.viewerState.relationship,
    ).toBe('none');
  });

  it('Flow E queues an offline message and flushes it when the shared runtime reconnects', async () => {
    const harness = createProductionSimulationHarness('acceptance-flow-e');
    const command = {
      clientCreatedAt: harness.services.simulationRuntime.clock
        .now()
        .toISOString(),
      clientMessageId: 'acceptance-offline-message',
      conversationId: GOLDEN_CONVERSATION_IDS.minhAnh,
      text: 'Tin nhắn offline acceptance',
    };

    harness.services.simulationRuntime.setNetwork('offline');
    await expect(
      harness.services.messageTransport.sendText(command),
    ).rejects.toMatchObject({ code: 'offline', retryable: true });
    expect(harness.messages.listOutbox()).toHaveLength(1);

    harness.services.simulationRuntime.setNetwork('online');
    await harness.messages.whenIdle();

    expect(harness.messages.listOutbox()).toEqual([]);
    expect(
      Object.values(harness.services.simulationRuntime.readWorld().messages),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conversationId: GOLDEN_CONVERSATION_IDS.minhAnh,
          deliveryStatus: 'sent',
          kind: 'text',
          text: command.text,
        }),
      ]),
    );
  });

  it('Flow F restores profile, notification, message, membership, clock and network with one reset', async () => {
    const harness = createProductionSimulationHarness('acceptance-flow-f');
    const baseline = await harness.services.simulationRuntime.snapshot();
    const notifications = await harness.services.notificationRepository.list({
      limit: 50,
      session: harness.session,
    });
    const notification = notifications.items[0]!;
    const invite = notifications.items.find(
      (item) => item.kind === 'set-invite',
    );
    if (invite?.kind !== 'set-invite') {
      throw new Error('Expected a canonical set invite.');
    }

    await harness.services.simulationRuntime.mutate(
      {
        operation: SIMULATION_RUNTIME_OPERATIONS.updateProfile,
        scope: GOLDEN_PROFILE_IDS.quanViewer,
      },
      (world, context) => {
        const viewer = world.profiles[GOLDEN_PROFILE_IDS.quanViewer]!;
        viewer.canonicalProfile.profileBasics.displayName = 'Reset Me';
        viewer.updatedAt = context.clock.now().toISOString();
      },
    );
    await harness.services.notificationRepository.markRead({
      notificationId: notification.id,
      session: harness.session,
    });
    await harness.services.simulationRuntime.mutate(
      {
        operation: SIMULATION_RUNTIME_OPERATIONS.joinSet,
        scope: invite.payload.setId,
      },
      (world, context) =>
        changeSimulationSetMembership(world, {
          membership: 'joined',
          now: context.clock.now().toISOString(),
          profileId: world.viewerId,
          setId: invite.payload.setId as never,
        }),
    );
    harness.services.simulationRuntime.setNetwork('offline');
    await harness.services.messageTransport
      .sendText({
        clientCreatedAt: harness.services.simulationRuntime.clock
          .now()
          .toISOString(),
        clientMessageId: 'acceptance-reset-message',
        conversationId: GOLDEN_CONVERSATION_IDS.minhAnh,
        text: 'Sẽ biến mất sau reset',
      })
      .catch(() => undefined);
    harness.services.simulationRuntime.advanceClock(90_000);

    await harness.services.simulationRuntime.reset();
    const after = await harness.services.simulationRuntime.snapshot();

    expect(after.world).toEqual(baseline.world);
    expect(after.clock).toEqual(baseline.clock);
    expect(after.controller).toEqual(baseline.controller);
    expect(after.scenarioId).toBe(baseline.scenarioId);
    expect(harness.messages.listOutbox()).toEqual([]);
  });
});
