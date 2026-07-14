create extension if not exists pgtap with schema extensions;

begin;

select plan(36);

select has_function(
  'public',
  'confirm_session_participation_v2',
  array['uuid', 'bigint', 'jsonb', 'text', 'uuid'],
  'participation confirmation RPC exists'
);
select has_function(
  'public',
  'dispute_session_participation_v2',
  array[
    'uuid',
    'public.participation_dispute_reason_v2',
    'text',
    'bigint',
    'jsonb',
    'text',
    'uuid'
  ],
  'participation dispute RPC exists'
);
select has_function(
  'public',
  'submit_player_endorsement_v2',
  array[
    'uuid',
    'uuid',
    'public.endorsement_kind_v2[]',
    'bigint',
    'bigint',
    'jsonb',
    'text',
    'uuid'
  ],
  'endorsement RPC exists'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000000921', 'authenticated', 'authenticated', 'command-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000000922', 'authenticated', 'authenticated', 'command-b@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000000923', 'authenticated', 'authenticated', 'command-c@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('01000000-0000-4000-8000-000000000921', 'Command A'),
  ('01000000-0000-4000-8000-000000000922', 'Command B'),
  ('01000000-0000-4000-8000-000000000923', 'Command C');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('20000000-0000-4000-8000-000000000921', '01000000-0000-4000-8000-000000000921', '01000000-0000-4000-8000-000000000921', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000922', '01000000-0000-4000-8000-000000000922', '01000000-0000-4000-8000-000000000922', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000923', '01000000-0000-4000-8000-000000000923', '01000000-0000-4000-8000-000000000923', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('30000000-0000-4000-8000-000000000921', '20000000-0000-4000-8000-000000000921', '01000000-0000-4000-8000-000000000921', 1, now()),
  ('30000000-0000-4000-8000-000000000922', '20000000-0000-4000-8000-000000000922', '01000000-0000-4000-8000-000000000922', 1, now()),
  ('30000000-0000-4000-8000-000000000923', '20000000-0000-4000-8000-000000000923', '01000000-0000-4000-8000-000000000923', 1, now());

insert into public.session_outcomes_v2 (
  id,
  session_id,
  source_event_id,
  source_session_version,
  participant_player_ids,
  role_assignments,
  source,
  scheduled_for,
  started_at,
  completed_at,
  confirmation_deadline_at
) values
  (
    '44000000-0000-4000-8000-000000000921',
    '82000000-0000-4000-8000-000000000921',
    '48000000-0000-4000-8000-000000000921',
    9,
    array[
      '20000000-0000-4000-8000-000000000921'::uuid,
      '20000000-0000-4000-8000-000000000922'::uuid
    ],
    '[]'::jsonb,
    '{"kind":"manual"}'::jsonb,
    '2026-07-14T12:30:00Z',
    '2026-07-14T12:35:00Z',
    '2026-07-14T14:00:00Z',
    '2026-07-17T14:00:00Z'
  ),
  (
    '44000000-0000-4000-8000-000000000922',
    '82000000-0000-4000-8000-000000000922',
    '48000000-0000-4000-8000-000000000922',
    5,
    array[
      '20000000-0000-4000-8000-000000000921'::uuid,
      '20000000-0000-4000-8000-000000000922'::uuid,
      '20000000-0000-4000-8000-000000000923'::uuid
    ],
    '[]'::jsonb,
    '{"kind":"manual"}'::jsonb,
    '2026-07-15T12:30:00Z',
    '2026-07-15T12:35:00Z',
    '2026-07-15T14:00:00Z',
    '2026-07-18T14:00:00Z'
  ),
  (
    '44000000-0000-4000-8000-000000000923',
    '82000000-0000-4000-8000-000000000923',
    '48000000-0000-4000-8000-000000000923',
    3,
    array[
      '20000000-0000-4000-8000-000000000921'::uuid,
      '20000000-0000-4000-8000-000000000922'::uuid
    ],
    '[]'::jsonb,
    '{"kind":"manual"}'::jsonb,
    '2026-07-16T12:30:00Z',
    '2026-07-16T12:35:00Z',
    '2026-07-16T14:00:00Z',
    '2026-07-19T14:00:00Z'
  );

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000921', true);

select is(
  public.confirm_session_participation_v2(
    '82000000-0000-4000-8000-000000000921',
    1,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-14T14:05:00Z","clientRequestId":"49000000-0000-4000-8000-000000000921","deviceInstallationId":"49000000-0000-4000-8000-999999999921","platform":"android"}'::jsonb,
    '49000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000921'
  ) ->> 'resultCode',
  'participation_confirmed',
  'first participant confirmation succeeds'
);
reset role;

select is(
  (select version::integer from public.session_outcomes_v2
    where id = '44000000-0000-4000-8000-000000000921'),
  2,
  'partial confirmation advances the outcome version'
);
select is(
  (select count(*)::integer from public.player_reputation_ledger_v2
    where metadata ->> 'sessionId' = '82000000-0000-4000-8000-000000000921'),
  0,
  'partial confirmation does not create completed-session reputation facts'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000921', true);
select is(
  (public.confirm_session_participation_v2(
    '82000000-0000-4000-8000-000000000921',
    1,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-14T14:05:00Z","clientRequestId":"49000000-0000-4000-8000-000000000921","deviceInstallationId":"49000000-0000-4000-8000-999999999921","platform":"android"}'::jsonb,
    '49000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000921'
  ) ->> 'repeated')::boolean,
  true,
  'same idempotency key replays the authoritative confirmation receipt'
);
select throws_like(
  $$select public.confirm_session_participation_v2(
    '82000000-0000-4000-8000-000000000921',
    2,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-14T14:05:00Z","clientRequestId":"49000000-0000-4000-8000-000000000921","deviceInstallationId":"49000000-0000-4000-8000-999999999921","platform":"android"}'::jsonb,
    '49000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000921'
  )$$,
  '%idempotency_key_reused%',
  'same idempotency key cannot mutate a different request'
);
reset role;

select is(
  (select count(*)::integer from public.session_participation_confirmations_v2
    where session_id = '82000000-0000-4000-8000-000000000921'
      and player_id = '20000000-0000-4000-8000-000000000921'),
  1,
  'confirmation replay creates no duplicate fact'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000922', true);
select throws_like(
  $$select public.confirm_session_participation_v2(
    '82000000-0000-4000-8000-000000000921',
    1,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-14T14:06:00Z","clientRequestId":"49000000-0000-4000-8000-000000000922","platform":"ios"}'::jsonb,
    '49000000-0000-4000-8000-000000000002',
    '43000000-0000-4000-8000-000000000922'
  )$$,
  '%aggregate_version_conflict%',
  'stale participation confirmation fails closed'
);
select is(
  public.confirm_session_participation_v2(
    '82000000-0000-4000-8000-000000000921',
    2,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-14T14:06:00Z","clientRequestId":"49000000-0000-4000-8000-000000000922","platform":"ios"}'::jsonb,
    '49000000-0000-4000-8000-000000000003',
    '43000000-0000-4000-8000-000000000923'
  ) ->> 'resultCode',
  'participation_confirmed',
  'final participant confirmation succeeds at the current version'
);
reset role;

select is(
  (select version::integer from public.session_outcomes_v2
    where id = '44000000-0000-4000-8000-000000000921'),
  3,
  'final confirmation advances the outcome to version three'
);
select is(
  (select count(*)::integer from public.player_reputation_ledger_v2
    where dimension = 'completed_sessions'
      and metadata ->> 'sessionId' = '82000000-0000-4000-8000-000000000921'),
  2,
  'full confirmation creates one immutable completion fact per participant'
);
select is(
  (select completed_sessions::integer from public.player_reputation_projection_v2
    where player_id = '20000000-0000-4000-8000-000000000921'),
  1,
  'participant A projection includes the verified session'
);
select is(
  (select completed_sessions::integer from public.player_reputation_projection_v2
    where player_id = '20000000-0000-4000-8000-000000000922'),
  1,
  'participant B projection includes the verified session'
);
select is(
  (select jsonb_array_length(receipt -> 'eventIds')
    from private.command_receipts_v1
    where player_id = '20000000-0000-4000-8000-000000000922'
      and command_name = 'confirm_session_participation_v2'
      and idempotency_key = '49000000-0000-4000-8000-000000000003'),
  7,
  'final confirmation receipt contains participation plus two reputation/activity fan-outs'
);
select is(
  (select count(*)::integer from private.outbox_events
    where event_type = 'player.reputation_changed.v2'
      and correlation_id = '43000000-0000-4000-8000-000000000923'),
  2,
  'final confirmation emits one reputation event per participant'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000921', true);
select is(
  public.submit_player_endorsement_v2(
    '82000000-0000-4000-8000-000000000921',
    '20000000-0000-4000-8000-000000000922',
    array['cooperative', 'would_play_again']::public.endorsement_kind_v2[],
    0,
    3,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-14T14:10:00Z","clientRequestId":"49000000-0000-4000-8000-000000000924","platform":"android"}'::jsonb,
    '49000000-0000-4000-8000-000000000004',
    '43000000-0000-4000-8000-000000000924'
  ) ->> 'resultCode',
  'endorsement_submitted',
  'fully confirmed participant can endorse another participant'
);
reset role;

select is(
  (select count(*)::integer from public.player_endorsements_v2
    where session_id = '82000000-0000-4000-8000-000000000921'),
  1,
  'one endorsement aggregate is stored'
);
select is(
  (select positive_endorsements::integer
    from public.player_reputation_projection_v2
    where player_id = '20000000-0000-4000-8000-000000000922'),
  2,
  'target projection counts every positive endorsement kind'
);
select is(
  (select count(*)::integer from public.player_reputation_ledger_v2
    where source_type = 'endorsement'
      and player_id = '20000000-0000-4000-8000-000000000922'),
  2,
  'endorsement kinds create two immutable ledger facts'
);
select is(
  (select jsonb_array_length(receipt -> 'eventIds')
    from private.command_receipts_v1
    where player_id = '20000000-0000-4000-8000-000000000921'
      and command_name = 'submit_player_endorsement_v2'
      and idempotency_key = '49000000-0000-4000-8000-000000000004'),
  4,
  'endorsement receipt contains endorsement, reputation, activity and notification events'
);
select is(
  (select count(*)::integer from private.outbox_events
    where event_type = 'player.endorsed.v2'
      and correlation_id = '43000000-0000-4000-8000-000000000924'),
  1,
  'endorsement emits one versioned domain event'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000921', true);
select is(
  (public.submit_player_endorsement_v2(
    '82000000-0000-4000-8000-000000000921',
    '20000000-0000-4000-8000-000000000922',
    array['cooperative', 'would_play_again']::public.endorsement_kind_v2[],
    0,
    3,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-14T14:10:00Z","clientRequestId":"49000000-0000-4000-8000-000000000924","platform":"android"}'::jsonb,
    '49000000-0000-4000-8000-000000000004',
    '43000000-0000-4000-8000-000000000924'
  ) ->> 'repeated')::boolean,
  true,
  'endorsement timeout replay returns the same authoritative receipt'
);
reset role;
select is(
  (select count(*)::integer from public.player_endorsements_v2
    where session_id = '82000000-0000-4000-8000-000000000921'),
  1,
  'endorsement replay creates no duplicate aggregate'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000921', true);
select throws_like(
  $$select public.submit_player_endorsement_v2(
    '82000000-0000-4000-8000-000000000921',
    '20000000-0000-4000-8000-000000000922',
    array['cooperative']::public.endorsement_kind_v2[],
    0,
    3,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-14T14:11:00Z","clientRequestId":"49000000-0000-4000-8000-000000000925","platform":"android"}'::jsonb,
    '49000000-0000-4000-8000-000000000005',
    '43000000-0000-4000-8000-000000000925'
  )$$,
  '%endorsement_already_submitted%',
  'different command cannot duplicate the same player-to-player session endorsement'
);
select throws_like(
  $$select public.submit_player_endorsement_v2(
    '82000000-0000-4000-8000-000000000921',
    '20000000-0000-4000-8000-000000000921',
    array['positive_attitude']::public.endorsement_kind_v2[],
    0,
    3,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-14T14:12:00Z","clientRequestId":"49000000-0000-4000-8000-000000000926","platform":"android"}'::jsonb,
    '49000000-0000-4000-8000-000000000006',
    '43000000-0000-4000-8000-000000000926'
  )$$,
  '%self_endorsement_forbidden%',
  'self endorsement is rejected'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000921', true);
select is(
  public.confirm_session_participation_v2(
    '82000000-0000-4000-8000-000000000922',
    1,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-15T14:05:00Z","clientRequestId":"49000000-0000-4000-8000-000000000927","platform":"android"}'::jsonb,
    '49000000-0000-4000-8000-000000000007',
    '43000000-0000-4000-8000-000000000927'
  ) ->> 'resultCode',
  'participation_confirmed',
  'one participant can record evidence before another participant disputes'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000922', true);
select is(
  public.dispute_session_participation_v2(
    '82000000-0000-4000-8000-000000000922',
    'session_did_not_happen',
    'The lobby never started.',
    2,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-15T14:06:00Z","clientRequestId":"49000000-0000-4000-8000-000000000928","platform":"ios"}'::jsonb,
    '49000000-0000-4000-8000-000000000008',
    '43000000-0000-4000-8000-000000000928'
  ) ->> 'resultCode',
  'participation_disputed',
  'participant dispute is recorded as immutable evidence'
);
reset role;

select is(
  (select state::text from public.session_outcomes_v2
    where id = '44000000-0000-4000-8000-000000000922'),
  'disputed',
  'participant dispute moves the outcome into disputed state'
);
select is(
  (select count(*)::integer from public.player_reputation_ledger_v2
    where metadata ->> 'sessionId' = '82000000-0000-4000-8000-000000000922'),
  0,
  'disputed session creates no positive completed-session ledger fact'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000923', true);
select throws_like(
  $$select public.confirm_session_participation_v2(
    '82000000-0000-4000-8000-000000000922',
    3,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-15T14:07:00Z","clientRequestId":"49000000-0000-4000-8000-000000000929","platform":"web"}'::jsonb,
    '49000000-0000-4000-8000-000000000009',
    '43000000-0000-4000-8000-000000000929'
  )$$,
  '%session_outcome_disputed%',
  'positive confirmation is blocked after a dispute'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000921', true);
select throws_like(
  $$select public.submit_player_endorsement_v2(
    '82000000-0000-4000-8000-000000000922',
    '20000000-0000-4000-8000-000000000922',
    array['cooperative']::public.endorsement_kind_v2[],
    0,
    3,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-15T14:08:00Z","clientRequestId":"49000000-0000-4000-8000-000000000930","platform":"android"}'::jsonb,
    '49000000-0000-4000-8000-000000000010',
    '43000000-0000-4000-8000-000000000930'
  )$$,
  '%session_outcome_disputed%',
  'disputed session cannot produce a positive endorsement'
);
select throws_like(
  $$select public.confirm_session_participation_v2(
    '82000000-0000-4000-8000-000000000923',
    1,
    '{"appVersion":"2.0.0","clientRequestId":"49000000-0000-4000-8000-000000000931","platform":"android"}'::jsonb,
    '49000000-0000-4000-8000-000000000011',
    '43000000-0000-4000-8000-000000000931'
  )$$,
  '%audit metadata is missing%',
  'missing audit metadata fails before mutation'
);
reset role;

update public.players
set lifecycle_state = 'suspended',
    lifecycle_version = lifecycle_version + 1
where id = '20000000-0000-4000-8000-000000000923';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000923', true);
select throws_like(
  $$select public.confirm_session_participation_v2(
    '82000000-0000-4000-8000-000000000922',
    3,
    '{"appVersion":"2.0.0","clientCreatedAt":"2026-07-15T14:09:00Z","clientRequestId":"49000000-0000-4000-8000-000000000932","platform":"web"}'::jsonb,
    '49000000-0000-4000-8000-000000000012',
    '43000000-0000-4000-8000-000000000932'
  )$$,
  '%trust_player_not_active%',
  'suspended lifecycle fails closed before command execution'
);
reset role;

set local role anon;
select throws_like(
  $$select public.confirm_session_participation_v2(
    '82000000-0000-4000-8000-000000000923',
    1,
    '{}'::jsonb,
    '49000000-0000-4000-8000-000000000013',
    '43000000-0000-4000-8000-000000000933'
  )$$,
  '%permission denied%',
  'anonymous callers cannot execute trust commands'
);
reset role;

select * from finish();
rollback;
