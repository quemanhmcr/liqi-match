import { describe, expect, it } from '@jest/globals';

import {
  ActivityItemV2Schema,
  CorrelationIdSchema,
  EngagementPreferencesV2Schema,
  EventIdSchema,
  PlayerIdSchema,
  PlaySessionIdSchema,
  SessionOutcomeIdSchema,
} from '@/shared/contracts/core-v2';
import { InMemoryActivityNotificationProviderV2 } from '@/entities/notification-v2';

import {
  ActivityNotificationEligibilityPolicyV2,
  type ActivityNotificationEligibilityInputV2,
} from '../activity-notification-eligibility-policy';

const PLAYER_A = PlayerIdSchema.parse('20000000-0000-4000-8000-000000000001');
const SESSION_ID = PlaySessionIdSchema.parse(
  '45000000-0000-4000-8000-000000000001',
);
const OUTCOME_ID = SessionOutcomeIdSchema.parse(
  '44000000-0000-4000-8000-000000000001',
);
const CAUSATION_ID = EventIdSchema.parse(
  '43000000-0000-4000-8000-000000000001',
);
const SOURCE_EVENT_ID = EventIdSchema.parse(
  '43000000-0000-4000-8000-000000000010',
);
const CORRELATION_ID = CorrelationIdSchema.parse(
  '43000000-0000-4000-8000-000000000002',
);

function activity(kind: 'feedback_prompt' | 'reputation_progress') {
  return ActivityItemV2Schema.parse({
    activityItemId: '47000000-0000-4000-8000-000000000010',
    createdAt: '2026-07-14T12:10:00.000Z',
    deduplicationKey: `policy:${kind}:player-a`,
    dismissedAt: null,
    kind,
    payload: kind === 'feedback_prompt' ? { sessionId: SESSION_ID } : {},
    playerId: PLAYER_A,
    priority: 1000,
    version: 1,
  });
}

function preferences(
  override: Partial<
    ReturnType<typeof EngagementPreferencesV2Schema.parse>
  > = {},
) {
  return EngagementPreferencesV2Schema.parse({
    activityEnabled: true,
    feedbackPromptsEnabled: true,
    maxReactivationNotificationsPerDay: 2,
    playerId: PLAYER_A,
    pushReactivationEnabled: true,
    repeatPlayPromptsEnabled: true,
    updatedAt: '2026-07-14T12:00:00.000Z',
    version: 3,
    ...override,
  });
}

function policy() {
  return new ActivityNotificationEligibilityPolicyV2({
    createDecisionId: () => '48000000-0000-4000-8000-000000000001',
  });
}

function input(
  override: Partial<ActivityNotificationEligibilityInputV2> = {},
): ActivityNotificationEligibilityInputV2 {
  return {
    activityItem: activity('feedback_prompt'),
    causationId: CAUSATION_ID,
    correlationId: CORRELATION_ID,
    engagementPreferences: preferences(),
    evaluatedAt: new Date('2026-07-14T12:10:00.000Z'),
    reactivationNotificationsUsed: 0,
    sourceEventId: SOURCE_EVENT_ID,
    target: {
      outcomeId: OUTCOME_ID,
      sessionId: SESSION_ID,
      target: 'session_feedback' as const,
    },
    ...override,
  };
}

describe('ActivityNotificationEligibilityPolicyV2', () => {
  it('passes an eligible feedback request through the Senior 3 provider', async () => {
    const request = policy().evaluate(input());
    const provider = new InMemoryActivityNotificationProviderV2(
      { canQueuePush: () => true },
      () => '49000000-0000-4000-8000-000000000001',
      () => new Date('2026-07-14T12:11:00.000Z'),
    );

    const receipt = await provider.request(request);

    expect(request.deliveryDecision).toMatchObject({
      frequencyWindowKey: '2026-07-14:UTC',
      inboxAllowed: true,
      pushAllowed: true,
      reason: 'eligible',
    });
    expect(receipt).toMatchObject({
      correlationId: request.correlationId,
      inboxStatus: 'queued',
      pushStatus: 'queued',
      target: request.target,
    });
  });

  it('keeps the activity inbox item while suppressing frequency-capped push', async () => {
    const request = policy().evaluate(
      input({ reactivationNotificationsUsed: 2 }),
    );
    const provider = new InMemoryActivityNotificationProviderV2(
      { canQueuePush: () => true },
      () => '49000000-0000-4000-8000-000000000002',
      () => new Date('2026-07-14T12:11:00.000Z'),
    );
    const receipt = await provider.request(request);

    expect(request.deliveryDecision).toMatchObject({
      inboxAllowed: true,
      pushAllowed: false,
      reason: 'frequency_capped',
    });
    expect(receipt).toMatchObject({
      inboxStatus: 'queued',
      pushStatus: 'suppressed_by_supplier',
    });
  });

  it('suppresses both inbox and push when activity is disabled', () => {
    const request = policy().evaluate(
      input({
        engagementPreferences: preferences({ activityEnabled: false }),
      }),
    );

    expect(request.deliveryDecision).toMatchObject({
      inboxAllowed: false,
      pushAllowed: false,
      reason: 'activity_disabled',
    });
  });

  it('suppresses a disabled feedback kind without affecting reputation activity', () => {
    const disabledFeedback = preferences({ feedbackPromptsEnabled: false });
    const feedback = policy().evaluate(
      input({ engagementPreferences: disabledFeedback }),
    );
    const reputation = policy().evaluate(
      input({
        activityItem: activity('reputation_progress'),
        engagementPreferences: disabledFeedback,
        target: { playerId: PLAYER_A, target: 'reputation' },
      }),
    );

    expect(feedback.deliveryDecision.reason).toBe('kind_disabled');
    expect(reputation.deliveryDecision.reason).toBe('eligible');
  });
});
