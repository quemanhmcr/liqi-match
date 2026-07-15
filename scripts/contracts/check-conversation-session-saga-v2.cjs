const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const foundation = read(
  'supabase/migrations/202607140054_core_v2_party_play_session_foundation.sql',
);
const sessionAuthority = read(
  'supabase/migrations/202607141200_core_v2_play_session_walking_skeleton.sql',
);
const setMembership = read(
  'supabase/migrations/202607141220_core_v2_match_set_membership.sql',
);
const conversation = read(
  'supabase/migrations/202607140058_core_v2_conversation_authority.sql',
);
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(
  /create table private\.play_session_conversation_projection_v2[\s\S]*source_aggregate_version[\s\S]*membership_version[\s\S]*accepted_membership[\s\S]*state private\.play_session_conversation_sync_state_v2/i.test(
    foundation,
  ),
  'Session authority must persist independent aggregate/membership versions and accepted membership.',
);
expect(
  /create or replace function public\.record_session_conversation_projection_v2\([\s\S]*p_source_aggregate_version bigint[\s\S]*p_membership_version bigint[\s\S]*p_accepted_membership jsonb/i.test(
    sessionAuthority,
  ),
  'Session authority must expose the canonical projection acknowledgement RPC.',
);
expect(
  /p_accepted_membership is distinct from current_membership/i.test(
    sessionAuthority,
  ) &&
    /p_source_aggregate_version > session_row\.version/i.test(
      sessionAuthority,
    ) &&
    /existing_projection\.membership_version > p_membership_version/i.test(
      sessionAuthority,
    ),
  'Session acknowledgement must reject mismatched, future, or stale supplier facts.',
);
expect(
  /revoke execute on function public\.record_session_conversation_projection_v2\([\s\S]*from public, anon, authenticated/i.test(
    sessionAuthority,
  ) &&
    /grant execute on function public\.record_session_conversation_projection_v2\([\s\S]*to service_role/i.test(
      sessionAuthority,
    ),
  'Only service_role may acknowledge the Session projection.',
);
expect(
  /create_session_from_set_v2[\s\S]*insert into public\.play_session_members_v2[\s\S]*from public\.match_set_members_v2[\s\S]*'session\.created\.v2'[\s\S]*'communicationProvisioningRequired', true[\s\S]*'membership', private\.play_session_membership_snapshot_v2/i.test(
    setMembership,
  ),
  'Set conversion must emit a full authoritative membership snapshot requiring communication provisioning.',
);
expect(
  /to_regprocedure\([\s\S]*record_session_conversation_projection_v2\(uuid,uuid,bigint,bigint,jsonb,text,text\)/i.test(
    conversation,
  ) &&
    /execute[\s\S]*record_session_conversation_projection_v2\(\$1,\$2,\$3,\$4,\$5,\$6,\$7\)/i.test(
      conversation,
    ),
  'Conversation consumer and Session supplier RPC signatures must match exactly.',
);
expect(
  /'session\.created\.v2'[\s\S]*communicationProvisioningRequired[\s\S]*public\.provision_session_conversation_v2/i.test(
    conversation,
  ) &&
    /'session\.member_joined\.v2'[\s\S]*'session\.member_left\.v2'[\s\S]*public\.reconcile_conversation_membership_v2/i.test(
      conversation,
    ),
  'Session events must provision and reconcile the Conversation authority.',
);
expect(
  /'sourceAggregateVersion', aggregate_version_value/i.test(conversation) &&
    /'membership', membership/i.test(conversation) &&
    /\(p_membership ->> 'membershipVersion'\)::bigint/i.test(conversation),
  'Conversation must preserve separate source aggregate and membership versions.',
);
expect(
  /acknowledgementPending[\s\S]*conversation_consumed_events_v2[\s\S]*jsonb_set\([\s\S]*'\{acknowledgement\}'/i.test(
    conversation,
  ),
  'Event replay must retry a previously pending acknowledgement without reprovisioning.',
);
expect(
  /project_conversation_system_activity_v2/i.test(conversation) &&
    /sourceEventId/i.test(conversation),
  'Accepted Session events must project deduplicated system activity.',
);
expect(
  !/http|fetch\(|net\.|dblink/i.test(setMembership),
  'Session transaction must use the outbox rather than an external Conversation call.',
);

if (failures.length) {
  console.error(
    `Conversation Session saga v2 check failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
  process.exit(1);
}
console.log(
  'Conversation Session saga v2 check passed with full membership, dual-version, replay, service-role, and outbox invariants.',
);
