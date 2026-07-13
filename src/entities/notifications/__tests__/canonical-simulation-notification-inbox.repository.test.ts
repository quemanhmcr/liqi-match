import { describe, expect, it } from '@jest/globals';

import type { AuthSession } from '@/shared/auth/auth-service';
import {
  createProductionSimulationRuntime,
  GOLDEN_PROFILE_IDS,
  VIEWER_READY_HAPPY_PATH_SCENARIO,
} from '@/entities/simulation';
import { createCanonicalSimulationNotificationInboxRepository } from '../data/canonical-simulation-notification-inbox.repository';

const session: AuthSession = {
  accessToken: 'simulation-access-token',
  expiresAt: 4_102_444_800,
  refreshToken: 'simulation-refresh-token',
  tokenType: 'bearer',
  user: { id: 'auth-user-does-not-need-to-match-profile-id' },
};

describe('canonical simulation notification repository', () => {
  it('projects notification actors and relations from the same canonical world', async () => {
    const runtime = createProductionSimulationRuntime({
      initialScenarioId: VIEWER_READY_HAPPY_PATH_SCENARIO.id,
      namespace: 'canonical-notifications-projection',
    });
    const repository = createCanonicalSimulationNotificationInboxRepository({
      runtime,
    });

    const page = await repository.list({ limit: 20, session });
    const directMessage = page.items.find(
      (notification) => notification.kind === 'direct-message',
    );

    const viewerNotificationCount = Object.values(
      runtime.readWorld().notifications,
    ).filter(
      (notification) =>
        notification.recipientId === GOLDEN_PROFILE_IDS.quanViewer,
    ).length;
    expect(page.items).toHaveLength(viewerNotificationCount);
    expect(directMessage).toBeDefined();
    if (directMessage?.kind !== 'direct-message') return;
    expect(
      runtime.readWorld().profiles[directMessage.payload.actor.id as never]
        ?.canonicalProfile.profileBasics.displayName,
    ).toBe(directMessage.payload.actor.displayName);
    expect(directMessage.payload.actor.avatarAssetKey).toBe(
      runtime.readWorld().profiles[directMessage.payload.actor.id as never]
        ?.media.avatarAssetKey,
    );
    expect(
      runtime.readWorld().conversations[
        directMessage.payload.conversationId as never
      ],
    ).toBeDefined();
    expect(page.latestWatermark).not.toBeNull();
  });

  it('mutates seen/read state in world and restores it through runtime reset', async () => {
    const runtime = createProductionSimulationRuntime({
      initialScenarioId: VIEWER_READY_HAPPY_PATH_SCENARIO.id,
      namespace: 'canonical-notifications-mutation',
    });
    const repository = createCanonicalSimulationNotificationInboxRepository({
      runtime,
    });
    const initial = await repository.list({ limit: 20, session });
    const latest = initial.latestWatermark!;
    const target = initial.items[0]!;

    await repository.markSeenThrough({ seenThrough: latest, session });
    const read = await repository.markRead({
      notificationId: target.id,
      session,
    });

    expect(read.notification.readAt).toBe(runtime.clock.now().toISOString());
    expect(
      runtime.readWorld().notifications[target.id as never]?.recipientId,
    ).toBe(GOLDEN_PROFILE_IDS.quanViewer);
    expect((await repository.getSummary({ session })).unseenCount).toBe(0);

    await runtime.reset();
    expect((await repository.getSummary({ session })).unseenCount).toBe(
      initial.unseenCount,
    );
  });
});
