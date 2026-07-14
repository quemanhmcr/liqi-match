const fs = require('node:fs');

const migrationPath =
  'supabase/migrations/202607141410_core_v2_completed_session_consumer.sql';
const databaseTestPath =
  'supabase/tests/database/core_v2_completed_session_consumer.test.sql';
const notificationContractPath =
  'contracts/core-v2/notification/activity-notification.ts';

const migration = fs.readFileSync(migrationPath, 'utf8');
const databaseTest = fs.readFileSync(databaseTestPath, 'utf8');
const notificationContract = fs.readFileSync(notificationContractPath, 'utf8');
const failures = [];
const requireInvariant = (condition, message) => {
  if (!condition) failures.push(message);
};

requireInvariant(
  migration.includes(
    'create or replace function private.consume_session_completed_v2(p_event jsonb)',
  ),
  'The canonical private completed-session consumer must exist',
);
requireInvariant(
  migration.includes("event_type_value <> 'session.completed.v2'") &&
    migration.includes('event_version_value <> 2') &&
    migration.includes("aggregate_type_value <> 'play_session'") &&
    migration.includes(
      "payload_value ->> 'verification' <> 'participant_quorum'",
    ),
  'The consumer must fail closed to the exact Senior 2 event type, version, aggregate and quorum verification',
);
requireInvariant(
  migration.includes(
    'private.jsonb_has_exact_keys_v2(p_event, envelope_keys)',
  ) &&
    migration.includes(
      'private.jsonb_has_exact_keys_v2(payload_value, payload_keys)',
    ) &&
    migration.includes('role_assignment_keys constant text[]') &&
    migration.includes("array['kind', 'matchId']") &&
    migration.includes("array['kind', 'setId']"),
  'Envelope, payload, role assignments and source variants must reject missing or unknown keys',
);
requireInvariant(
  migration.includes(
    'jsonb_array_length(participants_value) not between 2 and 5',
  ) &&
    migration.includes(
      'not private.is_unique_uuid_array_v2(participant_player_ids_value)',
    ) &&
    migration.includes('from public.players players') &&
    migration.includes(
      'matching_player_count_value <> participant_count_value',
    ),
  'Completed outcomes must retain 2-5 unique canonical players',
);
requireInvariant(
  migration.includes("roleSlug', '') !~ '^[a-z0-9_]{1,32}$'") &&
    migration.includes(
      'not role_player_id_value = any(participant_player_ids_value)',
    ) &&
    migration.includes(
      'not private.is_unique_uuid_array_v2(role_assignment_player_ids_value)',
    ),
  'Role assignments must be unique, stable and limited to participants',
);
requireInvariant(
  migration.includes('private.command_request_hash_v1(p_event)') &&
    migration.includes(
      'pg_advisory_xact_lock(hashtextextended(event_id_value::text, 0))',
    ) &&
    migration.includes("'event_replay_conflict'") &&
    migration.includes('private.trust_consumed_events_v2') &&
    migration.includes("'{repeated}'"),
  'Event replay must be serialized, hash-protected and return an authoritative repeated receipt',
);
requireInvariant(
  migration.includes("'session_outcome_conflict'") &&
    /'eventIds'\s*,\s*'\[\]'::jsonb\s*,\s*'repeated'\s*,\s*true/i.test(
      migration,
    ),
  'A duplicate completion with a new eventId must be semantically deduplicated',
);
requireInvariant(
  migration.includes("'session.outcome_recorded.v2'") &&
    migration.includes("'activity.item_created.v2'") &&
    migration.includes("'activity.notification_requested.v2'") &&
    migration.includes('p_activity_event_id') &&
    migration.includes("'sourceEventId', p_activity_event_id") &&
    migration.includes("'causationId', p_causation_id"),
  'Outcome, activity and typed notification events must preserve both event-step and original causation',
);
requireInvariant(
  notificationContract.includes(
    'event.causationId !== event.payload.request.sourceEventId',
  ) &&
    notificationContract.includes(
      'event.correlationId !== event.payload.request.correlationId',
    ),
  'The TypeScript supplier event must enforce activity causation and original correlation',
);
requireInvariant(
  migration.includes('private.activity_notification_frequency_v2') &&
    migration.includes("'YYYY-MM-DD') || ':UTC'") &&
    migration.includes('for update;') &&
    migration.includes('notifications_used_value >= max_notifications_value') &&
    migration.includes("reason_value := 'frequency_capped'") &&
    migration.includes('if push_allowed_value then'),
  'Notification frequency decisions must use locked durable UTC-window evidence and only consume slots for allowed push',
);
requireInvariant(
  migration.includes('preference_row.activity_enabled') &&
    migration.includes('preference_row.feedback_prompts_enabled') &&
    migration.includes('preference_row.repeat_play_prompts_enabled') &&
    migration.includes('preference_row.push_reactivation_enabled') &&
    migration.includes('config_row.feedback_prompts_enabled'),
  'Activity and delivery eligibility must honor user preferences and rollback flags',
);
requireInvariant(
  migration.includes("'feedback_prompt'") &&
    migration.includes("'sessionId', session_id_value") &&
    migration.includes("'outcomeId', outcome_row.id") &&
    migration.includes(
      "'confirmationDeadlineAt', outcome_row.confirmation_deadline_at",
    ) &&
    migration.includes("'session_feedback'"),
  'Feedback activity must carry the authoritative session, outcome and deadline target',
);
requireInvariant(
  migration.includes(
    'revoke execute on function private.consume_session_completed_v2(jsonb)',
  ) &&
    /grant execute on function private\.consume_session_completed_v2\(jsonb\)\s+to service_role;/i.test(
      migration,
    ) &&
    !/grant execute on function private\.consume_session_completed_v2\(jsonb\)\s+to authenticated;/i.test(
      migration,
    ),
  'Only service_role may execute the private completed-session consumer',
);
requireInvariant(
  migration.includes("set search_path = ''") &&
    migration
      .split(/security definer/i)
      .slice(1)
      .every((block) => /^\s*set search_path = ''/i.test(block)),
  'Every security-definer function must pin an empty search_path',
);
requireInvariant(
  !/auth\.uid\(\)/.test(migration),
  'The service event consumer must not infer player identity from auth.uid()',
);

const assertionCount = (
  databaseTest.match(
    /select\s+(?:has_function|has_table|is|isnt|ok|lives_ok|throws_ok|throws_like)\s*\(/gi,
  ) ?? []
).length;
const plannedCount = Number(databaseTest.match(/select plan\((\d+)\)/i)?.[1]);
requireInvariant(
  assertionCount === plannedCount,
  `pgTAP plan=${plannedCount} but found ${assertionCount} assertions`,
);
for (const evidence of [
  'same event replay emits no duplicate events',
  'same session completion with a new eventId is semantically deduplicated',
  'same eventId with different payload is rejected',
  'unknown event version fails closed',
  'unverified completion cannot create a positive outcome',
  'frequency cap suppresses push without hiding the inbox activity',
  'feedback rollback flag suppresses new prompts',
  'mobile clients cannot invoke the private event consumer',
]) {
  requireInvariant(
    databaseTest.includes(evidence),
    `pgTAP must prove: ${evidence}`,
  );
}

if (failures.length) {
  console.error(
    `Core V2 completed-session consumer check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}

console.log(
  `Core V2 completed-session consumer check passed (${assertionCount} pgTAP assertions).`,
);
