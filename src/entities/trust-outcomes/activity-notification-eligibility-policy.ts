import {
  ActivityNotificationRequestV2Schema,
  type ActivityItemV2,
  type ActivityNotificationRequestV2,
  type ActivityNotificationTargetV2,
  type EngagementPreferencesV2,
} from '@/shared/contracts/core-v2';

export type ActivityNotificationEligibilityInputV2 = Readonly<{
  activityItem: ActivityItemV2;
  causationId: string;
  correlationId: string;
  engagementPreferences: EngagementPreferencesV2;
  evaluatedAt: Date;
  reactivationNotificationsUsed: number;
  sourceEventId: string;
  target: ActivityNotificationTargetV2;
}>;

export type ActivityNotificationEligibilityPolicyDependenciesV2 = Readonly<{
  createDecisionId(): string;
}>;

export class ActivityNotificationEligibilityPolicyV2 {
  constructor(
    private readonly dependencies: ActivityNotificationEligibilityPolicyDependenciesV2,
  ) {}

  evaluate(
    input: ActivityNotificationEligibilityInputV2,
  ): ActivityNotificationRequestV2 {
    const preferences = input.engagementPreferences;
    const kindEnabled = isKindEnabled(input.activityItem.kind, preferences);
    const used = Math.max(0, Math.trunc(input.reactivationNotificationsUsed));
    const evaluatedAt = input.evaluatedAt.toISOString();
    const frequencyWindowKey = `${evaluatedAt.slice(0, 10)}:UTC`;

    let inboxAllowed = true;
    let pushAllowed = true;
    let reason:
      | 'eligible'
      | 'activity_disabled'
      | 'kind_disabled'
      | 'push_disabled'
      | 'frequency_capped' = 'eligible';

    if (!preferences.activityEnabled) {
      inboxAllowed = false;
      pushAllowed = false;
      reason = 'activity_disabled';
    } else if (!kindEnabled) {
      inboxAllowed = false;
      pushAllowed = false;
      reason = 'kind_disabled';
    } else if (!preferences.pushReactivationEnabled) {
      pushAllowed = false;
      reason = 'push_disabled';
    } else if (used >= preferences.maxReactivationNotificationsPerDay) {
      pushAllowed = false;
      reason = 'frequency_capped';
    }

    return ActivityNotificationRequestV2Schema.parse({
      activityItem: input.activityItem,
      causationId: input.causationId,
      correlationId: input.correlationId,
      deliveryDecision: {
        decisionId: this.dependencies.createDecisionId(),
        engagementPreferencesVersion: preferences.version,
        evaluatedAt,
        frequencyWindowKey,
        inboxAllowed,
        maxReactivationNotificationsPerDay:
          preferences.maxReactivationNotificationsPerDay,
        pushAllowed,
        reactivationNotificationsUsed: used,
        reason,
      },
      sourceEventId: input.sourceEventId,
      target: input.target,
    });
  }
}

function isKindEnabled(
  kind: ActivityItemV2['kind'],
  preferences: EngagementPreferencesV2,
) {
  switch (kind) {
    case 'feedback_prompt':
      return preferences.feedbackPromptsEnabled;
    case 'repeat_play_recommendation':
      return preferences.repeatPlayPromptsEnabled;
    case 'reputation_progress':
      return true;
  }
}
