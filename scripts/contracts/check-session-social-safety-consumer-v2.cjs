const fs = require('node:fs');
const PgQueryModule = require('pg-query-emscripten').default;

const migrationPath =
  'supabase/migrations/202607141460_session_social_safety_consumer_v2.sql';
const testPath =
  'supabase/tests/database/session_social_safety_consumer_v2.test.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const databaseTest = fs.readFileSync(testPath, 'utf8');
const fixturePath =
  'contracts/core-v2/fixtures/consumer/session-block-enforcement.json';
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const providerTest = fs.readFileSync(
  'src/entities/play-session/__tests__/session-social-block-consumer.test.ts',
  'utf8',
);
const failures = [];

requireSupplierFixture();

function requireSupplierFixture() {
  const event = fixture.event;
  const relationship = fixture.relationship;
  const policy = fixture.policy;
  requireInvariant(
    event.eventType === 'player.blocked.v2' &&
      event.eventVersion === 2 &&
      event.aggregateType === 'social_relationship',
    'supplier fixture must use canonical player.blocked.v2 envelope',
  );
  requireInvariant(
    event.aggregateId === relationship.relationshipId &&
      event.aggregateVersion === relationship.version &&
      event.payload.blockerPlayerId === relationship.viewerPlayerId &&
      event.payload.blockedPlayerId === relationship.targetPlayerId,
    'supplier fixture relationship/version/direction must match event facts',
  );
  requireInvariant(
    relationship.capabilities.blocked === true &&
      relationship.capabilities.canInviteToSession === false &&
      relationship.capabilities.canViewConversation === false,
    'supplier fixture must fail invitation and visibility capabilities closed',
  );
  requireInvariant(
    policy.preStart.cancelPendingInvites === true &&
      policy.preStart.revokeActiveMembership === true &&
      policy.preStart.deny.includes('ready_response') &&
      policy.preStart.deny.includes('member_visibility') &&
      policy.activePlay.transition === 'disputed' &&
      policy.replay === 'idempotent' &&
      policy.unblock.restoreSessionMembership === false,
    'supplier fixture must lock the complete Session block policy',
  );
  requireInvariant(
    providerTest.includes('session-block-enforcement.json') &&
      providerTest.includes('supplierEvent.aggregateId') &&
      providerTest.includes('supplierRelationship.version'),
    'provider tests must execute the exact supplier fixture',
  );
}

function requireInvariant(condition, message) {
  if (!condition) failures.push(message);
}

for (const table of [
  'play_session_consumed_social_events_v2',
  'play_session_social_event_failures_v2',
  'play_session_social_visibility_revocations_v2',
]) {
  requireInvariant(
    migration.includes(`create table private.${table}`),
    `missing private.${table}`,
  );
  requireInvariant(
    migration.includes(`revoke all on private.${table}`) &&
      migration.includes(`grant all on private.${table} to service_role`),
    `${table} must be service-role only`,
  );
}

for (const fn of [
  'private.consume_play_session_social_event_v2',
  'public.process_pending_play_session_social_events_v2',
  'public.dispatch_play_session_social_events_v2',
  'private.is_play_session_visibility_revoked_v2',
  'private.assert_play_session_visible_v2',
]) {
  requireInvariant(
    migration.includes(`create or replace function ${fn}`),
    `missing ${fn}`,
  );
}

requireInvariant(
  migration.includes('private.assert_play_session_social_worker_v2') &&
    migration.includes("auth.role(), '') <> 'service_role'") &&
    migration.includes("session_user not in ('postgres', 'supabase_admin')"),
  'service-role and pg_cron execution must fail closed',
);
requireInvariant(
  migration.includes("p_event ->> 'eventType' <> 'player.blocked.v2'") &&
    migration.includes(
      "p_event ->> 'aggregateType' <> 'social_relationship'",
    ) &&
    migration.includes("'unsupported_event_version'"),
  'consumer must reject unsupported event type/version',
);
requireInvariant(
  migration.includes(
    'aggregate_id_value <> private.social_relationship_id_v2',
  ) &&
    migration.includes('actor_player_id_value <> blocker_player_id_value') &&
    migration.includes('authoritative_event is distinct from p_event'),
  'consumer must bind event direction and payload to Social-owned outbox facts',
);
requireInvariant(
  migration.includes('event_id_value is null') &&
    migration.includes('aggregate_id_value is null') &&
    migration.includes('blocker_player_id_value is null') &&
    migration.includes('blocked_player_id_value is null') &&
    migration.includes("'Session social-event envelope is incomplete.'"),
  'consumer must reject missing required envelope facts before SQL three-valued comparisons',
);
requireInvariant(
  migration.includes(
    'payload_fingerprint_value := private.command_request_hash_v1(p_event)',
  ) &&
    migration.includes("'event_replay_conflict'") &&
    migration.includes("'{repeated}'"),
  'consumer must reject conflicting replay and return repeated receipt',
);
requireInvariant(
  migration.includes("hashtextextended('play-session:'") &&
    migration.includes('for update;'),
  'consumer must serialize every Session aggregate',
);
requireInvariant(
  migration.includes("invites.state = 'pending'") &&
    migration.includes("set state = 'cancelled'") &&
    migration.includes("'session.invite_cancelled.v2'") &&
    migration.includes("'cancelledInviteCount'"),
  'pending invites must be cancelled with a causal event and receipt count',
);
requireInvariant(
  migration.includes(
    "session_row.state in ('draft', 'recruiting', 'ready_check', 'scheduled')",
  ) &&
    migration.includes('private.cancel_open_ready_check_for_membership_v2') &&
    migration.includes("reason_code = 'relationship_blocked'") &&
    migration.includes("'session.member_left.v2'") &&
    migration.includes(
      'membership_version = sessions.membership_version + 1',
    ) &&
    migration.includes(
      'removed_player_id_value <> session_row.owner_player_id',
    ),
  'pre-start block must preserve owner, revoke membership/readiness, and advance membership',
);
requireInvariant(
  migration.includes(
    "session_row.state in ('in_progress', 'completion_pending')",
  ) &&
    migration.includes("set state = 'disputed'") &&
    migration.includes("'session.safety_disputed.v2'") &&
    migration.includes("'sourceSocialEventId', event_id_value"),
  'active play must retain history and become causally disputed',
);
requireInvariant(
  migration.includes(
    'insert into private.play_session_social_visibility_revocations_v2',
  ) &&
    migration.includes('on conflict (session_id, player_id) do nothing') &&
    !migration.includes("p_event ->> 'eventType' = 'player.unblocked.v2'"),
  'visibility revocation must be durable and unblock must not restore it',
);
requireInvariant(
  migration.includes('play_session_ready_responses_social_safety_v2') &&
    migration.includes('private.assert_play_session_visible_v2') &&
    migration.includes('not private.is_play_session_visibility_revoked_v2') &&
    migration.includes('not private.are_players_blocked_v2'),
  'read, ready-response, current-list, and invite-list paths must fail closed immediately',
);
requireInvariant(
  migration.includes(
    'left join private.play_session_social_event_failures_v2',
  ) &&
    migration.includes('for update of events skip locked') &&
    migration.includes("'retry_scheduled'") &&
    migration.includes('make_interval('),
  'worker must isolate failures with bounded retry/backoff',
);
requireInvariant(
  !/update\s+private\.outbox_events[\s\S]{0,180}\bstatus\s*=/i.test(migration),
  'Session consumer must not own shared outbox status',
);
requireInvariant(
  migration.includes("'play-session-social-safety-v2'") &&
    migration.includes("'5 seconds'") &&
    migration.includes('cron.schedule('),
  'authoritative block events must dispatch every five seconds',
);
requireInvariant(
  migration.includes(
    'revoke execute on function public.process_pending_play_session_social_events_v2(integer)',
  ) &&
    migration.includes(
      'grant execute on function public.process_pending_play_session_social_events_v2(integer)',
    ) &&
    migration.includes('to service_role;'),
  'worker execution must remain service-role only',
);

const planned = Number(databaseTest.match(/select plan\((\d+)\)/i)?.[1]);
const assertionCount = (
  databaseTest.match(
    /select\s+(?:has_table|has_function|function_privs_are|ok|is|isnt|throws_like|lives_ok)\s*\(/gi,
  ) ?? []
).length;
requireInvariant(
  planned === assertionCount && assertionCount >= 40,
  `pgTAP plan=${planned}, assertions=${assertionCount}`,
);
for (const evidence of [
  'live block hides member list before asynchronous event consumption',
  'live block rejects ready response before the worker runs',
  'pending Session invite is cancelled',
  'pre-start block removes the non-owner member',
  'open ready-check is cancelled by membership revocation',
  'in-progress block disputes Session',
  'disputed Session preserves both historical active memberships',
  'same event replays without duplicate mutation',
  'conflicting event replay fails closed',
  'unblock does not restore removed member visibility',
  'unblock never restores Session membership',
  'malformed event enters retry ledger',
  'Session consumer does not own shared outbox status',
]) {
  requireInvariant(
    databaseTest.includes(evidence),
    `pgTAP missing: ${evidence}`,
  );
}

(async () => {
  const parser = await new PgQueryModule();
  for (const [label, sql] of [
    ['migration', migration],
    ['pgTAP', databaseTest],
  ]) {
    const parsed = parser.parse(sql);
    if (parsed.error) {
      failures.push(`${label} SQL parse failed: ${parsed.error.message}`);
    }
  }

  if (failures.length) {
    console.error('Session social safety consumer v2 check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(
    `Session social safety consumer v2 check passed (${assertionCount} pgTAP assertions).`,
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
