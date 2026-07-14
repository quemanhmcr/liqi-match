create extension if not exists pgtap with schema extensions;

begin;

select plan(34);

select has_function(
  'private',
  'consume_session_completed_v2',
  array['jsonb'],
  'completed-session consumer exists behind the private service-role seam'
);
select has_table(
  'private',
  'activity_notification_frequency_v2',
  'notification frequency evidence is durable'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000000911', 'authenticated', 'authenticated', 'outcome-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000000912', 'authenticated', 'authenticated', 'outcome-b@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('01000000-0000-4000-8000-000000000911', 'Outcome A'),
  ('01000000-0000-4000-8000-000000000912', 'Outcome B');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('20000000-0000-4000-8000-000000000911', '01000000-0000-4000-8000-000000000911', '01000000-0000-4000-8000-000000000911', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000912', '01000000-0000-4000-8000-000000000912', '01000000-0000-4000-8000-000000000912', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('30000000-0000-4000-8000-000000000911', '20000000-0000-4000-8000-000000000911', '01000000-0000-4000-8000-000000000911', 1, now()),
  ('30000000-0000-4000-8000-000000000912', '20000000-0000-4000-8000-000000000912', '01000000-0000-4000-8000-000000000912', 1, now());

update public.engagement_preferences_v2
set max_reactivation_notifications_per_day = 0,
    version = version + 1
where player_id = '20000000-0000-4000-8000-000000000912';

create temporary table completed_event_v2 (event jsonb not null);
insert into completed_event_v2 (event) values (
  jsonb_build_object(
    'eventId', '48000000-0000-4000-8000-000000000911',
    'eventType', 'session.completed.v2',
    'eventVersion', 2,
    'aggregateType', 'play_session',
    'aggregateId', '82000000-0000-4000-8000-000000000911',
    'aggregateVersion', 9,
    'actorPlayerId', '20000000-0000-4000-8000-000000000911',
    'correlationId', '43000000-0000-4000-8000-000000000911',
    'causationId', null,
    'occurredAt', '2026-07-14T14:01:00.000Z',
    'payload', jsonb_build_object(
      'sessionId', '82000000-0000-4000-8000-000000000911',
      'participantPlayerIds', jsonb_build_array(
        '20000000-0000-4000-8000-000000000911',
        '20000000-0000-4000-8000-000000000912'
      ),
      'scheduledFor', '2026-07-14T12:30:00.000Z',
      'startedAt', '2026-07-14T12:35:00.000Z',
      'completedAt', '2026-07-14T14:00:00.000Z',
      'roleAssignments', jsonb_build_array(
        jsonb_build_object(
          'assignmentId', '84000000-0000-4000-8000-000000000911',
          'playerId', '20000000-0000-4000-8000-000000000911',
          'roleSlug', 'support',
          'assignedAt', '2026-07-14T12:31:00.000Z'
        ),
        jsonb_build_object(
          'assignmentId', '84000000-0000-4000-8000-000000000912',
          'playerId', '20000000-0000-4000-8000-000000000912',
          'roleSlug', 'damage',
          'assignedAt', '2026-07-14T12:31:00.000Z'
        )
      ),
      'source', jsonb_build_object(
        'kind', 'match',
        'matchId', '83000000-0000-4000-8000-000000000911'
      ),
      'verification', 'participant_quorum'
    )
  )
);

create temporary table first_consume_result_v2 as
select private.consume_session_completed_v2(event) as result
from completed_event_v2;

select is(
  (select (result ->> 'repeated')::boolean from first_consume_result_v2),
  false,
  'first completion event is not a replay'
);
select is(
  (select count(*)::integer from public.session_outcomes_v2
    where session_id = '82000000-0000-4000-8000-000000000911'),
  1,
  'one authoritative outcome is recorded'
);
select is(
  (select source_session_version::integer from public.session_outcomes_v2
    where session_id = '82000000-0000-4000-8000-000000000911'),
  9,
  'outcome retains the source aggregate version'
);
select is(
  (select cardinality(participant_player_ids) from public.session_outcomes_v2
    where session_id = '82000000-0000-4000-8000-000000000911'),
  2,
  'outcome retains the exact participant set'
);
select is(
  (select count(*)::integer from public.activity_items_v2
    where deduplication_key like 'feedback:82000000-0000-4000-8000-000000000911:%'),
  2,
  'both participants receive one feedback activity item'
);
select is(
  (select count(*)::integer from private.outbox_events
    where event_type = 'session.outcome_recorded.v2'
      and correlation_id = '43000000-0000-4000-8000-000000000911'),
  1,
  'one outcome-recorded event is emitted'
);
select is(
  (select count(*)::integer from private.outbox_events
    where event_type = 'activity.item_created.v2'
      and correlation_id = '43000000-0000-4000-8000-000000000911'),
  2,
  'one activity event is emitted per participant'
);
select is(
  (select count(*)::integer from private.outbox_events
    where event_type = 'activity.notification_requested.v2'
      and correlation_id = '43000000-0000-4000-8000-000000000911'),
  2,
  'one typed notification request is emitted per activity item'
);
select is(
  (select count(*)::integer from private.outbox_events
    where correlation_id = '43000000-0000-4000-8000-000000000911'),
  5,
  'the completed-session fan-out emits exactly five events'
);
select is(
  (select count(*)::integer from private.outbox_events
    where event_type = 'session.outcome_recorded.v2'
      and causation_id = '48000000-0000-4000-8000-000000000911'),
  1,
  'outcome event is caused by the completed-session event'
);
select is(
  (select count(*)::integer from private.outbox_events notification_requests
    where notification_requests.event_type = 'activity.notification_requested.v2'
      and notification_requests.causation_id = (
        notification_requests.payload #>> '{payload,request,sourceEventId}'
      )::uuid),
  2,
  'notification request events are caused by their activity events'
);
select is(
  (select count(*)::integer from private.outbox_events notification_requests
    where notification_requests.event_type = 'activity.notification_requested.v2'
      and notification_requests.payload #>> '{payload,request,causationId}' =
        '48000000-0000-4000-8000-000000000911'),
  2,
  'typed requests retain the original completed-session causation'
);
select is(
  (select count(*)::integer from private.outbox_events notification_requests
    where notification_requests.event_type = 'activity.notification_requested.v2'
      and notification_requests.payload #>> '{payload,request,target,target}' =
        'session_feedback'),
  2,
  'feedback notifications carry a typed session_feedback target'
);
select is(
  (select notification_requests.payload #>> '{payload,request,deliveryDecision,reason}'
    from private.outbox_events notification_requests
    where notification_requests.event_type = 'activity.notification_requested.v2'
      and notification_requests.payload #>> '{payload,request,activityItem,playerId}' =
        '20000000-0000-4000-8000-000000000911'),
  'eligible',
  'eligible participant receives an eligible delivery decision'
);
select is(
  (select (notification_requests.payload #>> '{payload,request,deliveryDecision,pushAllowed}')::boolean
    from private.outbox_events notification_requests
    where notification_requests.event_type = 'activity.notification_requested.v2'
      and notification_requests.payload #>> '{payload,request,activityItem,playerId}' =
        '20000000-0000-4000-8000-000000000911'),
  true,
  'eligible participant can receive push'
);
select is(
  (select notification_requests.payload #>> '{payload,request,deliveryDecision,reason}'
    from private.outbox_events notification_requests
    where notification_requests.event_type = 'activity.notification_requested.v2'
      and notification_requests.payload #>> '{payload,request,activityItem,playerId}' =
        '20000000-0000-4000-8000-000000000912'),
  'frequency_capped',
  'zero-cap participant receives a frequency-capped decision'
);
select is(
  (select (notification_requests.payload #>> '{payload,request,deliveryDecision,inboxAllowed}')::boolean
    from private.outbox_events notification_requests
    where notification_requests.event_type = 'activity.notification_requested.v2'
      and notification_requests.payload #>> '{payload,request,activityItem,playerId}' =
        '20000000-0000-4000-8000-000000000912'),
  true,
  'frequency cap suppresses push without hiding the inbox activity'
);
select is(
  (select (notification_requests.payload #>> '{payload,request,deliveryDecision,pushAllowed}')::boolean
    from private.outbox_events notification_requests
    where notification_requests.event_type = 'activity.notification_requested.v2'
      and notification_requests.payload #>> '{payload,request,activityItem,playerId}' =
        '20000000-0000-4000-8000-000000000912'),
  false,
  'frequency-capped participant cannot receive push'
);
select is(
  (select reactivation_notifications_used::integer
    from private.activity_notification_frequency_v2
    where player_id = '20000000-0000-4000-8000-000000000911'),
  1,
  'eligible push consumes one durable UTC-window slot'
);
select is(
  (select reactivation_notifications_used::integer
    from private.activity_notification_frequency_v2
    where player_id = '20000000-0000-4000-8000-000000000912'),
  0,
  'suppressed push does not consume a frequency slot'
);

create temporary table replay_result_v2 as
select private.consume_session_completed_v2(event) as result
from completed_event_v2;
select is(
  (select (result ->> 'repeated')::boolean from replay_result_v2),
  true,
  'same event replay returns the authoritative receipt as repeated'
);
select is(
  (select count(*)::integer from private.outbox_events
    where correlation_id = '43000000-0000-4000-8000-000000000911'),
  5,
  'same event replay emits no duplicate events'
);

create temporary table semantic_duplicate_result_v2 as
select private.consume_session_completed_v2(
  jsonb_set(
    event,
    '{eventId}',
    '"48000000-0000-4000-8000-000000000919"'::jsonb
  )
) as result
from completed_event_v2;
select is(
  (select (result ->> 'repeated')::boolean
    from semantic_duplicate_result_v2),
  true,
  'same session completion with a new eventId is semantically deduplicated'
);
select is(
  (select count(*)::integer from public.session_outcomes_v2
    where session_id = '82000000-0000-4000-8000-000000000911'),
  1,
  'semantic duplicate cannot create a second outcome'
);

select throws_like(
  $$select private.consume_session_completed_v2(
    jsonb_set(
      (select event from completed_event_v2),
      '{payload,completedAt}',
      '"2026-07-14T13:59:00.000Z"'::jsonb
    )
  )$$,
  '%event_replay_conflict%',
  'same eventId with different payload is rejected'
);
select throws_like(
  $$select private.consume_session_completed_v2(
    jsonb_set(
      (select event from completed_event_v2),
      '{eventVersion}',
      '3'::jsonb
    )
  )$$,
  '%unsupported_event_version%',
  'unknown event version fails closed'
);
select throws_like(
  $$select private.consume_session_completed_v2(
    jsonb_set(
      (select event from completed_event_v2),
      '{payload,verification}',
      '"completion_pending"'::jsonb
    )
  )$$,
  '%participant_quorum%',
  'unverified completion cannot create a positive outcome'
);
select throws_like(
  $$select private.consume_session_completed_v2(
    jsonb_set(
      (select event from completed_event_v2),
      '{eventType}',
      '"session.cancelled.v2"'::jsonb
    )
  )$$,
  '%unsupported_event_type%',
  'cancelled sessions are not accepted by the completed-session consumer'
);

update private.trust_authority_config_v2
set feedback_prompts_enabled = false,
    updated_at = now()
where singleton;
create temporary table no_feedback_result_v2 as
select private.consume_session_completed_v2(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            (select event from completed_event_v2),
            '{eventId}',
            '"48000000-0000-4000-8000-000000000920"'::jsonb
          ),
          '{aggregateId}',
          '"82000000-0000-4000-8000-000000000920"'::jsonb
        ),
        '{correlationId}',
        '"43000000-0000-4000-8000-000000000920"'::jsonb
      ),
      '{payload,sessionId}',
      '"82000000-0000-4000-8000-000000000920"'::jsonb
    ),
    '{payload,completedAt}',
    '"2026-07-14T16:00:00.000Z"'::jsonb
  ) || jsonb_build_object('occurredAt', '2026-07-14T16:01:00.000Z')
) as result;
select is(
  (select count(*)::integer from public.session_outcomes_v2
    where session_id = '82000000-0000-4000-8000-000000000920'),
  1,
  'feedback rollback flag does not discard the authoritative outcome'
);
select is(
  (select count(*)::integer from public.activity_items_v2
    where deduplication_key like 'feedback:82000000-0000-4000-8000-000000000920:%'),
  0,
  'feedback rollback flag suppresses new prompts'
);
select is(
  (select count(*)::integer from private.outbox_events
    where correlation_id = '43000000-0000-4000-8000-000000000920'),
  1,
  'feedback rollback emits only the outcome-recorded event'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000911', true);
select throws_like(
  $$select private.consume_session_completed_v2('{}'::jsonb)$$,
  '%permission denied%',
  'mobile clients cannot invoke the private event consumer'
);
reset role;

select * from finish();
rollback;
