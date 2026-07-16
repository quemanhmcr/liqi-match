const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const contract = fs.readFileSync(
  path.join(root, 'contracts/core-v2/notification/activity-notification.ts'),
  'utf8',
);
const provider = fs.readFileSync(
  path.join(
    root,
    'src/entities/notification-v2/activity-notification-provider.ts',
  ),
  'utf8',
);
const implementation = fs.readFileSync(
  path.join(
    root,
    'src/entities/notification-v2/in-memory-activity-notification-provider.ts',
  ),
  'utf8',
);
const adr = fs.readFileSync(
  path.join(root, 'docs/adr/0007-core-v2-activity-notification-delivery.md'),
  'utf8',
);
const eligibilityPolicy = fs.readFileSync(
  path.join(
    root,
    'src/entities/trust-outcomes/activity-notification-eligibility-policy.ts',
  ),
  'utf8',
);
const activityFixtures = [
  'activity-feedback-notification-request.json',
  'activity-frequency-capped-request.json',
];
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const fixture of activityFixtures) {
  const file = path.join(root, 'contracts/core-v2/fixtures/consumer', fixture);
  requireInvariant(fs.existsSync(file), `missing activity fixture ${fixture}`);
  if (fs.existsSync(file)) JSON.parse(fs.readFileSync(file, 'utf8'));
}
for (const target of ['session_feedback', 'reputation', 'repeat_play']) {
  requireInvariant(
    contract.includes(`'${target}'`),
    `missing target ${target}`,
  );
}
for (const semantic of [
  'engagementPreferencesVersion',
  'frequencyWindowKey',
  'maxReactivationNotificationsPerDay',
  'reactivationNotificationsUsed',
  'deduplicationKey',
  'correlationId',
  'sourceEventId',
]) {
  requireInvariant(contract.includes(semantic), `missing semantic ${semantic}`);
}
requireInvariant(
  contract.includes("'activity.notification_requested.v2'") &&
    contract.includes('ActivityNotificationRequestEmittedEventV2Schema'),
  'supplier request must have a typed Core V2 event envelope',
);
requireInvariant(
  provider.includes('interface ActivityNotificationProviderV2'),
  'missing ActivityNotificationProviderV2 interface',
);
requireInvariant(
  implementation.includes('supplierPushAllowed') &&
    implementation.includes('runtimePushAllowed'),
  'supplier eligibility and runtime push suppression must remain separate',
);
requireInvariant(
  !/activityItem\.payload\.(kind|target|route|href)/.test(implementation),
  'notification routing must not branch on free-form activity payload',
);
requireInvariant(
  /never recalculates/.test(adr) &&
    /deferred-target/.test(adr) &&
    /route\s+is not an authorization boundary/i.test(adr),
  'ADR must preserve supplier authority and fail-closed routing',
);
requireInvariant(
  eligibilityPolicy.includes(
    'frequencyWindowKey = `${evaluatedAt.slice(0, 10)}:UTC`',
  ) &&
    eligibilityPolicy.includes('maxReactivationNotificationsPerDay') &&
    eligibilityPolicy.includes('pushReactivationEnabled') &&
    eligibilityPolicy.includes('feedbackPromptsEnabled') &&
    eligibilityPolicy.includes('repeatPlayPromptsEnabled'),
  'Senior 4 policy must preserve deterministic UTC caps and explicit preferences',
);
requireInvariant(
  !/auth\.uid\(\)/.test(
    contract + provider + implementation + eligibilityPolicy,
  ),
  'notification contracts must not treat auth.uid() as PlayerId',
);

if (failures.length) {
  console.error(
    `Activity notification V2 contract check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}
console.log(
  `Activity notification V2 contract check passed (${activityFixtures.length} consumer fixtures).`,
);
