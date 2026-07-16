import { describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import type { PlaySessionCommandService } from '@/entities/play-session';
import type {
  ActivityFeedRepository,
  RepeatPlayRecommendationProvider,
} from '@/entities/trust-outcomes';
import {
  TrustActivityItemV2Schema,
  type DismissActivityItemCommandV2,
  type RequestRepeatSessionCommandV2,
} from '@/shared/contracts/core-v2';
import type { AuthSession } from '@/shared/auth/auth-service';
import {
  AuthenticatedPrincipalV1Schema,
  PlayerLifecycleSnapshotV1Schema,
  type PlayerLifecycleStateV1,
} from '@/shared/contracts/core-v1';

import {
  orchestrateRepeatSession,
  RepeatSessionOrchestrationError,
} from '../repeat-session-orchestrator';

const parsedActivity = TrustActivityItemV2Schema.parse(
  JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        'contracts/core-v2/fixtures/provider/activity-item.json',
      ),
      'utf8',
    ),
  ),
);
if (parsedActivity.kind !== 'repeat_play_recommendation') {
  throw new Error('Expected repeat recommendation fixture.');
}
const activity = parsedActivity;

function createAuthSession(
  lifecycleState: PlayerLifecycleStateV1 = 'active',
): AuthSession {
  const active = lifecycleState === 'active';
  const playerId = '20000000-0000-4000-8000-000000000001';
  return {
    accessToken: 'test-access-token',
    expiresAt: 4_102_444_800,
    lifecycle: PlayerLifecycleSnapshotV1Schema.parse({
      discoverable: active,
      messagingAllowed: active,
      playerId,
      profileId: '30000000-0000-4000-8000-000000000001',
      state: lifecycleState,
      updatedAt: '2026-07-14T00:00:00.000Z',
      version: active ? 2 : 3,
    }),
    principal: AuthenticatedPrincipalV1Schema.parse({
      accountId: '01000000-0000-4000-8000-000000000001',
      expiresAt: '2100-01-01T00:00:00.000Z',
      issuedAt: '2099-12-31T23:00:00.000Z',
      playerId,
      sessionId: '09000000-0000-4000-8000-000000000001',
    }),
    refreshToken: 'test-refresh-token',
    tokenType: 'bearer',
    user: { id: '01000000-0000-4000-8000-000000000001' },
  };
}

const testAuthSession = createAuthSession();

function createDependencies({ dismissRejects = false } = {}) {
  const calls: string[] = [];
  const requestRepeatSession = jest.fn<
    RepeatPlayRecommendationProvider['requestRepeatSession']
  >(async (_session, command) => {
    calls.push('request');
    return {
      aggregateId: '47000000-0000-4000-8000-000000000020',
      aggregateType: 'repeat_play_request',
      aggregateVersion: 1,
      commandName: 'request_repeat_session_v2',
      correlationId: command.correlationId,
      eventIds: ['48000000-0000-4000-8000-000000000020'],
      occurredAt: '2026-07-14T14:00:00.000Z',
      repeated: false,
      requestId: '47000000-0000-4000-8000-000000000020',
      resultCode: 'repeat_session_requested',
      teammatePlayerIds: command.teammatePlayerIds,
    } as never;
  });
  const create = jest.fn<PlaySessionCommandService['create']>(
    async (_actor, command) => {
      calls.push('create');
      return {
        aggregateId: '62000000-0000-4000-8000-000000000001',
        aggregateType: 'play_session',
        aggregateVersion: 1,
        commandName: 'create_play_session_v2',
        correlationId: command.correlationId,
        eventIds: ['63000000-0000-4000-8000-000000000001'],
        lifecycleVersion: 2,
        occurredAt: '2026-07-14T14:00:01.000Z',
        repeated: false,
        resultCode: 'session_created',
        session: {
          sessionId: '62000000-0000-4000-8000-000000000001',
        },
      } as never;
    },
  );
  const dismiss = jest.fn<ActivityFeedRepository['dismiss']>(
    async (_session, command) => {
      calls.push('dismiss');
      if (dismissRejects) throw new Error('dismiss timeout');
      return {
        activityItem: {
          ...activity,
          dismissedAt: '2026-07-14T14:00:02.000Z',
          version: 2,
        },
        aggregateId: activity.activityItemId,
        aggregateType: 'activity_item',
        aggregateVersion: 2,
        commandName: 'dismiss_activity_item_v2',
        correlationId: command.correlationId,
        eventIds: ['48000000-0000-4000-8000-000000000021'],
        occurredAt: '2026-07-14T14:00:02.000Z',
        repeated: false,
        resultCode: 'activity_item_dismissed',
      } as never;
    },
  );
  const activityFeedRepository = {
    dismiss,
    list: async () => [activity],
  } satisfies ActivityFeedRepository;
  const repeatPlayRecommendationProvider = {
    listRecommendations: async () => [activity],
    requestRepeatSession,
  } satisfies RepeatPlayRecommendationProvider;
  return {
    activityFeedRepository,
    calls,
    create,
    dismiss,
    playSessionCommandService: {
      create,
    } as unknown as PlaySessionCommandService,
    repeatPlayRecommendationProvider,
    requestRepeatSession,
  };
}

describe('orchestrateRepeatSession', () => {
  it('requests, creates and dismisses in order with retry-stable source metadata', async () => {
    const dependencies = createDependencies();
    const result = await orchestrateRepeatSession({
      activity,
      activityFeedRepository: dependencies.activityFeedRepository,
      authSession: testAuthSession,
      playSessionCommandService: dependencies.playSessionCommandService,
      repeatPlayRecommendationProvider:
        dependencies.repeatPlayRecommendationProvider,
      timezone: 'Asia/Bangkok',
    });

    expect(dependencies.calls).toEqual(['request', 'create', 'dismiss']);
    const repeatCommand = dependencies.requestRepeatSession.mock
      .calls[0]?.[1] as RequestRepeatSessionCommandV2 | undefined;
    const dismissCommand = dependencies.dismiss.mock.calls[0]?.[1] as
      DismissActivityItemCommandV2 | undefined;
    const createCommand = dependencies.create.mock.calls[0]?.[1];
    expect(repeatCommand).toMatchObject({
      correlationId: activity.activityItemId,
      expectedVersion: 0,
      idempotencyKey: `trust:request-repeat-session:${activity.activityItemId}`,
      relationshipVersions: [
        {
          teammatePlayerId: activity.payload.teammatePlayerIds[0],
          version: activity.payload.relationshipVersion,
        },
      ],
    });
    expect(createCommand).toMatchObject({
      capacity: 2,
      correlationId: activity.activityItemId,
      expectedVersion: 0,
      idempotencyKey: `trust:create-repeat-session:${activity.activityItemId}`,
      initialInviteePlayerIds: activity.payload.teammatePlayerIds,
      timezone: 'Asia/Bangkok',
    });
    expect(dismissCommand).toMatchObject({
      activityItemId: activity.activityItemId,
      correlationId: activity.activityItemId,
      expectedVersion: activity.version,
      idempotencyKey: `trust:dismiss-repeat-activity:${activity.activityItemId}`,
    });
    expect(result.activityDismissed).toBe(true);
  });

  it('keeps the created session authoritative when only dismissal times out', async () => {
    const dependencies = createDependencies({ dismissRejects: true });
    const result = await orchestrateRepeatSession({
      activity,
      activityFeedRepository: dependencies.activityFeedRepository,
      authSession: testAuthSession,
      playSessionCommandService: dependencies.playSessionCommandService,
      repeatPlayRecommendationProvider:
        dependencies.repeatPlayRecommendationProvider,
    });

    expect(dependencies.calls).toEqual(['request', 'create', 'dismiss']);
    expect(result.activityDismissed).toBe(false);
    expect(result.playSession.session.sessionId).toBe(
      '62000000-0000-4000-8000-000000000001',
    );
  });

  it('fails before any command when the lifecycle is not active', async () => {
    const dependencies = createDependencies();
    await expect(
      orchestrateRepeatSession({
        activity,
        activityFeedRepository: dependencies.activityFeedRepository,
        authSession: createAuthSession('suspended'),
        playSessionCommandService: dependencies.playSessionCommandService,
        repeatPlayRecommendationProvider:
          dependencies.repeatPlayRecommendationProvider,
      }),
    ).rejects.toBeInstanceOf(RepeatSessionOrchestrationError);
    expect(dependencies.calls).toEqual([]);
  });
});
