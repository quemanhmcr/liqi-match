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
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(root, 'contracts/core-v2/compatibility-manifest.json'),
    'utf8',
  ),
);
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const fixture of manifest.activityNotificationConsumerFixtures ?? []) {
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
  !/auth\.uid\(\)/.test(contract + provider + implementation),
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
  `Activity notification V2 contract check passed (${manifest.activityNotificationConsumerFixtures.length} consumer fixtures).`,
);
