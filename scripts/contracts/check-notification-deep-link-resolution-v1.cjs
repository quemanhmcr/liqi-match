const fs = require('node:fs');

const migration = fs.readFileSync(
  'supabase/migrations/202607140037_notification_deep_link_resolution_v1.sql',
  'utf8',
);
const databaseTest = fs.readFileSync(
  'supabase/tests/database/notification_deep_link_resolution_v1.test.sql',
  'utf8',
);
const mobileResolver = fs.readFileSync(
  'src/app-shell/deep-link/notification-deep-link-resolver.ts',
  'utf8',
);
const coordinator = fs.readFileSync(
  'src/app-shell/deep-link/deep-link-coordinator.ts',
  'utf8',
);
const provider = fs.readFileSync(
  'src/app-shell/deep-link/DeepLinkCoordinatorProvider.tsx',
  'utf8',
);
const failures = [];

function requireInvariant(condition, message) {
  if (!condition) failures.push(message);
}

requireInvariant(
  /persisted\.id = p_notification_id[\s\S]*persisted\.source_event_id = p_source_event_id[\s\S]*persisted\.recipient_player_id = actor_snapshot\.player_id/i.test(
    migration,
  ),
  'Resolver must authorize NotificationId + source EventId + recipient PlayerId.',
);
requireInvariant(
  /canonical_deep_link := notification\.deep_link/i.test(migration),
  'Resolver must return the persisted canonical deep link, not client payload data.',
);
requireInvariant(
  /set seen_at = coalesce\(seen_at, transition_time\)[\s\S]*read_at = coalesce/i.test(
    migration,
  ),
  'Notification tap must atomically advance monotonic seen/read state.',
);
requireInvariant(
  /return_loop_feature_enabled_v1\([\s\S]*'deep_link'/i.test(migration),
  'Resolver must enforce the deep-link rollout kill switch.',
);
requireInvariant(
  /actor_snapshot\.state in \('registered', 'onboarding'\)[\s\S]*'defer_lifecycle'/i.test(
    migration,
  ),
  'Incomplete lifecycle must defer rather than infer profile readiness.',
);
requireInvariant(
  /actor_snapshot\.state in \('suspended', 'deleting', 'deleted'\)[\s\S]*'player_unavailable'/i.test(
    migration,
  ),
  'Unavailable lifecycle states must not route into domain destinations.',
);
requireInvariant(
  /private\.home_conversation_projection_v1[\s\S]*'defer_target'/i.test(
    migration,
  ),
  'Conversation routing must wait for the authoritative projection.',
);
requireInvariant(
  /from public\.matches[\s\S]*actor_snapshot\.player_id in/i.test(migration),
  'Match routing must verify current participant ownership.',
);
requireInvariant(
  /notification_deep_link_attempts_v1/i.test(migration),
  'Every authenticated resolution outcome must be observable.',
);
requireInvariant(
  /revoke all on function public\.resolve_notification_deep_link_v1\(uuid, uuid\)[\s\S]*grant execute[\s\S]*to authenticated/i.test(
    migration,
  ),
  'Resolver RPC must be authenticated-only.',
);
requireInvariant(
  !/p_deep_link|p_target|client_deep_link/i.test(migration),
  'Resolver must not accept client-provided destination semantics.',
);

requireInvariant(
  /rpc\/resolve_notification_deep_link_v1/.test(mobileResolver) &&
    /p_notification_id: input\.notificationId/.test(mobileResolver) &&
    /p_source_event_id: input\.sourceEventId/.test(mobileResolver) &&
    /NotificationDeepLinkResolutionV1Schema\.parse/.test(mobileResolver),
  'Mobile resolver must call the authenticated RPC with semantic IDs and runtime validation.',
);
requireInvariant(
  /routeForDeepLinkV1\(resolution\.deepLink\)/.test(coordinator) &&
    !/routeForDeepLinkV1\(intent\.deepLink\)/.test(coordinator),
  'Coordinator must navigate only with the server-resolved canonical deep link.',
);
requireInvariant(
  /new NotificationResponseBridge/.test(provider) &&
    /processPendingDeepLinkIntent/.test(provider) &&
    /if \(!session/.test(provider),
  'Notification response processing must wait for restored authentication state.',
);

const assertionCount = (
  databaseTest.match(/select\s+(?:is|ok|isnt|throws_ok)\s*\(/gi) ?? []
).length;
const plannedCount = Number(databaseTest.match(/select plan\((\d+)\)/i)?.[1]);
requireInvariant(
  assertionCount === plannedCount,
  `pgTAP plan=${plannedCount} but found ${assertionCount} assertions`,
);

if (failures.length) {
  console.error(
    `Notification deep-link authority check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}
console.log(
  `Notification deep-link authority check passed (${assertionCount} pgTAP assertions).`,
);
