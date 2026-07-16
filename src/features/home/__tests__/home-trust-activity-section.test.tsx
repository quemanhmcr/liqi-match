import { fireEvent, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { appRoutes } from '@/app-shell/navigation/routes';
import type { PlaySessionCommandService } from '@/entities/play-session';
import type {
  ActivityFeedRepository,
  RepeatPlayRecommendationProvider,
} from '@/entities/trust-outcomes';
import {
  PlayerIdSchema,
  TrustActivityItemV2Schema,
  type TrustActivityItemV2,
} from '@/shared/contracts/core-v2';
import {
  renderWithProviders,
  testAuthSession,
} from '@/test/render-with-providers';

import { HomeTrustActivitySection } from '../components/HomeTrustActivitySection';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
  },
}));

const viewerId = PlayerIdSchema.parse('20000000-0000-4000-8000-000000000001');
const teammateId = PlayerIdSchema.parse('20000000-0000-4000-8000-000000000002');
const parsedRepeatActivity = TrustActivityItemV2Schema.parse({
  activityItemId: '47000000-0000-4000-8000-000000000001',
  createdAt: '2026-07-14T12:08:00.000Z',
  deduplicationKey: 'repeat:home:test',
  dismissedAt: null,
  kind: 'repeat_play_recommendation',
  payload: {
    completedSessionCount: 1,
    relationshipId: null,
    relationshipVersion: 0,
    sourceSessionId: '42000000-0000-4000-8000-000000000001',
    teammatePlayerIds: [teammateId],
  },
  playerId: viewerId,
  priority: 800,
  version: 1,
});
const parsedFeedbackActivity = TrustActivityItemV2Schema.parse({
  activityItemId: '47000000-0000-4000-8000-000000000002',
  createdAt: '2026-07-14T12:09:00.000Z',
  deduplicationKey: 'feedback:home:test',
  dismissedAt: null,
  kind: 'feedback_prompt',
  payload: {
    confirmationDeadlineAt: '2026-07-17T14:00:00.000Z',
    outcomeId: '44000000-0000-4000-8000-000000000001',
    sessionId: '42000000-0000-4000-8000-000000000001',
  },
  playerId: viewerId,
  priority: 1000,
  version: 1,
});
if (parsedRepeatActivity.kind !== 'repeat_play_recommendation') {
  throw new Error('Expected repeat recommendation fixture.');
}
if (parsedFeedbackActivity.kind !== 'feedback_prompt') {
  throw new Error('Expected feedback fixture.');
}
const repeatActivity = parsedRepeatActivity;
const feedbackActivity = parsedFeedbackActivity;

function services(
  items: readonly TrustActivityItemV2[],
  options: Readonly<{
    dismissRejects?: boolean;
    recommendations?: readonly TrustActivityItemV2[];
  }> = {},
) {
  const requestRepeatSession = jest.fn<
    RepeatPlayRecommendationProvider['requestRepeatSession']
  >(
    async (_session, command) =>
      ({
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
      }) as never,
  );
  const dismiss = jest.fn<ActivityFeedRepository['dismiss']>(async () => {
    if (options.dismissRejects) throw new Error('dismiss timeout');
    return {
      activityItem: {
        ...repeatActivity,
        dismissedAt: '2026-07-14T14:00:02.000Z',
        version: 2,
      },
      aggregateId: repeatActivity.activityItemId,
      aggregateType: 'activity_item',
      aggregateVersion: 2,
      commandName: 'dismiss_activity_item_v2',
      correlationId: repeatActivity.activityItemId,
      eventIds: ['48000000-0000-4000-8000-000000000021'],
      occurredAt: '2026-07-14T14:00:02.000Z',
      repeated: false,
      resultCode: 'activity_item_dismissed',
    } as never;
  });
  const create = jest.fn<PlaySessionCommandService['create']>(
    async () =>
      ({
        aggregateId: '62000000-0000-4000-8000-000000000001',
        aggregateType: 'play_session',
        aggregateVersion: 1,
        commandName: 'create_play_session_v2',
        correlationId: repeatActivity.activityItemId,
        eventIds: ['63000000-0000-4000-8000-000000000001'],
        lifecycleVersion: 2,
        occurredAt: '2026-07-14T14:00:01.000Z',
        repeated: false,
        resultCode: 'session_created',
        session: {
          sessionId: '62000000-0000-4000-8000-000000000001',
        },
      }) as never,
  );
  return {
    activityFeedRepository: {
      dismiss,
      list: async () => items,
    } satisfies ActivityFeedRepository,
    create,
    dismiss,
    playSessionCommandService: {
      create,
    } as unknown as PlaySessionCommandService,
    repeatPlayRecommendationProvider: {
      listRecommendations: async () =>
        (options.recommendations ?? items).filter(
          (item) => item.kind === 'repeat_play_recommendation',
        ),
      requestRepeatSession,
    } satisfies RepeatPlayRecommendationProvider,
    requestRepeatSession,
  };
}

describe('HomeTrustActivitySection', () => {
  it('opens the typed feedback route from an authoritative feedback activity', async () => {
    mockPush.mockClear();
    const dependencies = services([feedbackActivity]);
    const screen = await renderWithProviders(
      <HomeTrustActivitySection session={testAuthSession} />,
      { serviceOverrides: dependencies },
    );

    await fireEvent.press(await screen.findByText('Phản hồi'));
    expect(mockPush).toHaveBeenCalledWith(
      appRoutes.sessions.feedback(feedbackActivity.payload.sessionId),
    );
  });

  it('hides a stale repeat card when live Social authority no longer recommends it', async () => {
    const dependencies = services([repeatActivity], { recommendations: [] });
    const screen = await renderWithProviders(
      <HomeTrustActivitySection session={testAuthSession} />,
      { serviceOverrides: dependencies },
    );

    await waitFor(() => expect(screen.queryClient.isFetching()).toBe(0));
    expect(screen.queryByText('Chơi lại cùng đồng đội')).toBeNull();
    expect(screen.queryByText('Tạo session')).toBeNull();
    expect(dependencies.requestRepeatSession).not.toHaveBeenCalled();
  });

  it('creates a repeat Play Session and dismisses the consumed activity', async () => {
    const dependencies = services([repeatActivity]);
    const screen = await renderWithProviders(
      <HomeTrustActivitySection session={testAuthSession} />,
      { serviceOverrides: dependencies },
    );

    await fireEvent.press(await screen.findByText('Tạo session'));
    expect(await screen.findByText('Đã tạo session chơi lại')).toBeTruthy();
    await waitFor(() => {
      expect(dependencies.requestRepeatSession).toHaveBeenCalledTimes(1);
      expect(dependencies.create).toHaveBeenCalledTimes(1);
      expect(dependencies.dismiss).toHaveBeenCalledTimes(1);
    });
    expect(dependencies.create.mock.calls[0]?.[1]).toMatchObject({
      capacity: 2,
      initialInviteePlayerIds: [teammateId],
    });
  });

  it('keeps one created session and removes the repeat CTA when dismissal times out', async () => {
    const dependencies = services([repeatActivity], { dismissRejects: true });
    const screen = await renderWithProviders(
      <HomeTrustActivitySection session={testAuthSession} />,
      { serviceOverrides: dependencies },
    );

    await fireEvent.press(await screen.findByText('Tạo session'));

    expect(await screen.findByText('Đã tạo session chơi lại')).toBeTruthy();
    expect(
      screen.getByText(
        'Session đã được tạo. Activity cũ sẽ được đồng bộ lại; không cần tạo thêm session.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Tạo session')).toBeNull();
    expect(dependencies.create).toHaveBeenCalledTimes(1);
    expect(dependencies.dismiss).toHaveBeenCalledTimes(1);
  });
});
