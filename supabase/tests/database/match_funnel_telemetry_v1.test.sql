create extension if not exists pgtap with schema extensions;

begin;

select plan(13);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000701', 'authenticated', 'authenticated', 'telemetry-a@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000702', 'authenticated', 'authenticated', 'telemetry-b@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000701', 'Telemetry A'),
  ('00000000-0000-0000-0000-000000000702', 'Telemetry B');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('20000000-0000-4000-8000-000000000701', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000701', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000702', '00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000702', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('30000000-0000-4000-8000-000000000701', '20000000-0000-4000-8000-000000000701', '00000000-0000-0000-0000-000000000701', 1, now()),
  ('30000000-0000-4000-8000-000000000702', '20000000-0000-4000-8000-000000000702', '00000000-0000-0000-0000-000000000702', 1, now());

insert into public.match_intents_v1 (
  id, player_id, state, filters, version, activated_at, expires_at
) values
  (
    '10000000-0000-4000-8000-000000000701',
    '20000000-0000-4000-8000-000000000701',
    'active',
    '{"intentKind":"normal","mode":"normal","partyFormat":"duo","sessionPlan":"quick","roleSlugs":[],"timezone":"Asia/Bangkok"}',
    1,
    now(),
    now() + interval '1 hour'
  ),
  (
    '10000000-0000-4000-8000-000000000702',
    '20000000-0000-4000-8000-000000000702',
    'active',
    '{"intentKind":"normal","mode":"normal","partyFormat":"duo","sessionPlan":"quick","roleSlugs":[],"timezone":"Asia/Bangkok"}',
    1,
    now(),
    now() + interval '1 hour'
  );

insert into private.discovery_snapshots_v1 (
  id, viewer_player_id, match_intent_id, intent_version, expires_at,
  total_candidates
) values (
  'b0000000-0000-4000-8000-000000000701',
  '20000000-0000-4000-8000-000000000701',
  '10000000-0000-4000-8000-000000000701',
  1,
  now() + interval '10 minutes',
  0
);
update private.discovery_snapshots_v1
set total_candidates = 1
where id = 'b0000000-0000-4000-8000-000000000701';

insert into public.relationship_decisions_v1 (
  id, actor_player_id, target_player_id, match_intent_id, decision
) values (
  '50000000-0000-4000-8000-000000000701',
  '20000000-0000-4000-8000-000000000701',
  '20000000-0000-4000-8000-000000000702',
  '10000000-0000-4000-8000-000000000701',
  'like'
);

insert into public.matches (
  id, profile_low_id, profile_high_id, player_low_id, player_high_id,
  source_v1, correlation_id_v1, home_kind_v1, home_status_v1
) values (
  '60000000-0000-4000-8000-000000000701',
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000702',
  '20000000-0000-4000-8000-000000000701',
  '20000000-0000-4000-8000-000000000702',
  'mutual_like',
  '70000000-0000-4000-8000-000000000701',
  'normal',
  'conversation_pending'
);

update public.matches
set home_status_v1 = 'conversation_ready'
where id = '60000000-0000-4000-8000-000000000701';

select * from private.begin_command_v1(
  'record_player_decision_v1',
  '00000000-0000-0000-0000-000000000701',
  'telemetry-decision-0001',
  repeat('a', 64)
);
select private.finish_command_v1(
  'record_player_decision_v1',
  '00000000-0000-0000-0000-000000000701',
  'telemetry-decision-0001',
  '{"relationshipState":"liked","match":null,"repeated":false}'::jsonb
);

select private.enqueue_contract_event_v1(
  'match.created.v1',
  'match',
  '60000000-0000-4000-8000-000000000701',
  '70000000-0000-4000-8000-000000000701',
  null,
  '{}'::jsonb,
  'telemetry:match-created:701'
);
select private.enqueue_contract_event_v1(
  'conversation.bootstrap_requested.v1',
  'match',
  '60000000-0000-4000-8000-000000000701',
  '70000000-0000-4000-8000-000000000701',
  null,
  '{}'::jsonb,
  'telemetry:bootstrap:701'
);

select is(
  (select count(*)::integer from private.match_funnel_events_v1 where event_name = 'match_intent_activated'),
  2,
  'active Match Intents emit one telemetry event per aggregate version'
);
select is(
  (select count(*)::integer from private.match_funnel_events_v1 where event_name = 'discovery_snapshot_created'),
  1,
  'candidate snapshot creation is observed'
);
select is(
  (select count(*)::integer from private.match_funnel_events_v1 where event_name = 'player_liked'),
  1,
  'like transition is observed'
);
select is(
  (select count(*)::integer from private.match_funnel_events_v1 where event_name = 'match_created'),
  1,
  'canonical Match creation is observed'
);
select is(
  (select count(*)::integer from private.match_funnel_events_v1 where event_name = 'conversation_ready'),
  1,
  'conversation-ready Home transition is observed'
);

update public.matches
set home_status_v1 = 'conversation_ready'
where id = '60000000-0000-4000-8000-000000000701';
select is(
  (select count(*)::integer from private.match_funnel_events_v1 where event_name = 'conversation_ready'),
  1,
  'no-op Match updates do not duplicate telemetry events'
);

set local role service_role;
create temporary table telemetry_metrics as
select public.get_match_funnel_metrics_v1(60) as metrics;

select is(
  (select (metrics #>> '{funnelCounts,match_intent_activated}')::integer from telemetry_metrics),
  2,
  'metrics report intent activations'
);
select is(
  (select (metrics #>> '{funnelCounts,match_created}')::integer from telemetry_metrics),
  1,
  'metrics report canonical matches'
);
select ok(
  (select (metrics ->> 'likeCommandP95Ms')::numeric from telemetry_metrics) >= 0,
  'metrics expose like command p95 from shared command receipts'
);
select is(
  (select (metrics #>> '{outbox,pendingMatchCreated}')::integer from telemetry_metrics),
  1,
  'metrics expose pending match-created outbox count'
);
select is(
  (select (metrics #>> '{outbox,pendingConversationBootstrap}')::integer from telemetry_metrics),
  1,
  'metrics expose pending bootstrap outbox count'
);
select ok(
  (select (metrics #>> '{outbox,oldestPendingSeconds}')::numeric from telemetry_metrics) >= 0,
  'metrics expose oldest pending outbox age'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_match_funnel_metrics_v1(integer)',
    'EXECUTE'
  ),
  'operational metrics are not client-readable'
);

reset role;
select * from finish();
rollback;
