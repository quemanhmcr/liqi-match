#!/usr/bin/env node
const fs = require('node:fs');
const PgQueryModule = require('pg-query-emscripten').default;

const files = {
  contractMigration:
    'supabase/migrations/202607141310_friendship_notification_contract_v2.sql',
  projectionMigration:
    'supabase/migrations/202607141311_friendship_notification_projection_v2.sql',
  databaseTest:
    'supabase/tests/database/friendship_notification_projection_v2.test.sql',
  notificationContract: 'contracts/core-v1/notification/index.ts',
  eventContract: 'contracts/core-v1/events/events.ts',
  mobileAdapter:
    'src/entities/notifications/data/api-notification-inbox.repository.ts',
  mobileViewModel:
    'src/features/notifications/model/notification-view-model.ts',
};
const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [
    key,
    fs.readFileSync(file, 'utf8'),
  ]),
);
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const kind of ['friendship_requested', 'friendship_accepted']) {
  requireInvariant(
    source.contractMigration.includes(`add value if not exists '${kind}'`),
    `Missing notification enum value ${kind}.`,
  );
  requireInvariant(
    source.notificationContract.includes(`'${kind}'`),
    `Missing executable NotificationV1 kind ${kind}.`,
  );
  requireInvariant(
    source.eventContract.includes(`'${kind}'`),
    `Missing notification.requested reason ${kind}.`,
  );
}
for (const marker of [
  'private.project_friendship_notification_v2',
  'outbox_project_friendship_notification_v2',
  "'notification.requested.v1'",
  "'causationId'",
  "'relationship_blocked'",
  'private.are_players_blocked_v2',
  'public.resolve_visible_profile_identity_v2',
  "notification_kind_value := 'friendship_requested'",
  "notification_kind_value := 'friendship_accepted'",
]) {
  requireInvariant(
    source.projectionMigration.includes(marker),
    `Missing friendship notification projection marker: ${marker}`,
  );
}
requireInvariant(
  !source.projectionMigration.includes("'friendshipRequestId', target"),
  'Persisted notification navigation must not depend on a friendship request ID.',
);
requireInvariant(
  /case 'friendship_requested'[\s\S]*requesterPlayerId/.test(
    source.mobileAdapter,
  ) &&
    /case 'friendship_accepted'[\s\S]*friendPlayerId/.test(
      source.mobileAdapter,
    ),
  'Mobile inbox adapter must map friendship kinds to canonical PlayerId payloads.',
);
requireInvariant(
  /kind: 'profile'[\s\S]*playerId: notification\.payload\.requesterPlayerId/.test(
    source.mobileViewModel,
  ) &&
    /kind: 'profile'[\s\S]*playerId: notification\.payload\.friendPlayerId/.test(
      source.mobileViewModel,
    ),
  'Friendship notification actions must route to the canonical profile destination.',
);

const assertionCount = (
  source.databaseTest.match(
    /select\s+(?:is|ok|isnt|throws_ok|throws_like)\s*\(/gi,
  ) ?? []
).length;
const plannedCount = Number(
  source.databaseTest.match(/select plan\((\d+)\)/i)?.[1],
);
requireInvariant(
  assertionCount === plannedCount,
  `pgTAP plan=${plannedCount} but found ${assertionCount} assertions.`,
);
for (const marker of [
  'friendship request projects exactly one notification request event',
  'accepted notification returns to the original requester',
  'block before persistence suppresses the friendship inbox row',
  'block after persistence revokes the old friendship notification deep link',
]) {
  requireInvariant(
    source.databaseTest.includes(marker),
    `Missing pgTAP walking-skeleton assertion: ${marker}`,
  );
}

(async () => {
  const parser = await new PgQueryModule();
  for (const file of ['contractMigration', 'projectionMigration']) {
    const parsed = parser.parse(source[file]);
    if (parsed.error) {
      failures.push(`${file}: ${parsed.error.message ?? String(parsed.error)}`);
    }
  }
  if (failures.length) {
    throw new Error(
      `Friendship notification projection check failed:\n${failures
        .map((failure) => `- ${failure}`)
        .join('\n')}`,
    );
  }
  console.log(
    `Friendship notification projection check passed (${assertionCount} pgTAP assertions).`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
