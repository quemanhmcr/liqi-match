create extension if not exists pgtap with schema extensions;

begin;

select plan(24);

select has_table('public', 'session_outcomes_v2', 'session outcomes table exists');
select has_table('public', 'session_participation_confirmations_v2', 'participation confirmations table exists');
select has_table('public', 'player_endorsements_v2', 'endorsements table exists');
select has_table('public', 'player_reputation_ledger_v2', 'immutable reputation ledger exists');
select has_table('public', 'player_reputation_projection_v2', 'rebuildable reputation projection exists');
select has_table('public', 'repeat_teammate_relationships_v2', 'repeat teammate table exists');
select has_table('public', 'activity_items_v2', 'activity table exists');
select has_table('public', 'engagement_preferences_v2', 'engagement preferences table exists');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000000901', 'authenticated', 'authenticated', 'trust-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000000902', 'authenticated', 'authenticated', 'trust-b@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('01000000-0000-4000-8000-000000000901', 'Trust A'),
  ('01000000-0000-4000-8000-000000000902', 'Trust B');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('20000000-0000-4000-8000-000000000901', '01000000-0000-4000-8000-000000000901', '01000000-0000-4000-8000-000000000901', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000902', '01000000-0000-4000-8000-000000000902', '01000000-0000-4000-8000-000000000902', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('30000000-0000-4000-8000-000000000901', '20000000-0000-4000-8000-000000000901', '01000000-0000-4000-8000-000000000901', 1, now()),
  ('30000000-0000-4000-8000-000000000902', '20000000-0000-4000-8000-000000000902', '01000000-0000-4000-8000-000000000902', 1, now());

select is(
  (select count(*)::integer from public.player_reputation_projection_v2),
  2,
  'new players receive zeroed projection rows'
);
select is(
  (select count(*)::integer from public.engagement_preferences_v2),
  2,
  'new players receive engagement preference rows'
);
select is(
  (select public_projection_enabled from private.trust_authority_config_v2 where singleton),
  false,
  'public trust projection starts shadow-hidden'
);

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
) values (
  '44000000-0000-4000-8000-000000000901',
  '82000000-0000-4000-8000-000000000901',
  '48000000-0000-4000-8000-000000000901',
  9,
  array[
    '20000000-0000-4000-8000-000000000901'::uuid,
    '20000000-0000-4000-8000-000000000902'::uuid
  ],
  '[]'::jsonb,
  '{"kind":"match","matchId":"82000000-0000-4000-8000-000000000999"}'::jsonb,
  '2026-07-14T12:30:00Z',
  '2026-07-14T12:35:00Z',
  '2026-07-14T14:00:00Z',
  '2026-07-17T14:00:00Z'
);

select lives_ok(
  $$select private.append_reputation_ledger_entry_v2(
    '20000000-0000-4000-8000-000000000902',
    'completed_sessions',
    1,
    'participation_confirmation',
    '45000000-0000-4000-8000-000000000901',
    'participation:45000000-0000-4000-8000-000000000901:completed',
    '{"sessionId":"82000000-0000-4000-8000-000000000901"}'::jsonb
  )$$,
  'ledger append succeeds through the private authoritative writer'
);
select lives_ok(
  $$select private.append_reputation_ledger_entry_v2(
    '20000000-0000-4000-8000-000000000902',
    'positive_endorsements',
    1,
    'endorsement',
    '46000000-0000-4000-8000-000000000901',
    'endorsement:46000000-0000-4000-8000-000000000901:cooperative',
    '{"kind":"cooperative"}'::jsonb
  )$$,
  'an endorsement fact appends independently'
);
select is(
  (select count(*)::integer from public.player_reputation_ledger_v2),
  2,
  'two immutable facts exist'
);
select is(
  (select completed_sessions::integer from public.player_reputation_projection_v2
    where player_id = '20000000-0000-4000-8000-000000000902'),
  1,
  'incremental projection includes completed session'
);
select is(
  (select positive_endorsements::integer from public.player_reputation_projection_v2
    where player_id = '20000000-0000-4000-8000-000000000902'),
  1,
  'incremental projection includes positive endorsement'
);
select throws_like(
  $$update public.player_reputation_ledger_v2 set delta = 2$$,
  '%reputation_ledger_immutable%',
  'ledger update is rejected'
);
select throws_like(
  $$delete from public.player_reputation_ledger_v2$$,
  '%reputation_ledger_immutable%',
  'ledger delete is rejected'
);

create temporary table projection_before_rebuild as
select
  completed_sessions,
  completion_reliability_bps,
  no_show_count,
  positive_endorsements,
  repeat_teammate_count,
  confirmed_moderation_actions,
  projection_version
from public.player_reputation_projection_v2
where player_id = '20000000-0000-4000-8000-000000000902';

select lives_ok(
  $$select private.rebuild_player_reputation_projection_v2(
    '20000000-0000-4000-8000-000000000902',
    now()
  )$$,
  'full projection rebuild succeeds from ledger only'
);
select is(
  (select row(
    completed_sessions,
    completion_reliability_bps,
    no_show_count,
    positive_endorsements,
    repeat_teammate_count,
    confirmed_moderation_actions,
    projection_version
  )::text from public.player_reputation_projection_v2
  where player_id = '20000000-0000-4000-8000-000000000902'),
  (select row(
    completed_sessions,
    completion_reliability_bps,
    no_show_count,
    positive_endorsements,
    repeat_teammate_count,
    confirmed_moderation_actions,
    projection_version
  )::text from projection_before_rebuild),
  'rebuild projection equals incremental projection'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000902', true);
select is(
  (public.get_player_trust_projection_v2('20000000-0000-4000-8000-000000000902') ->> 'completedSessions')::integer,
  1,
  'player can read own authoritative trust projection'
);
select throws_like(
  $$select * from public.player_reputation_ledger_v2$$,
  '%permission denied%',
  'authenticated clients cannot read the private ledger table directly'
);
select throws_like(
  $$update public.player_reputation_projection_v2 set completed_sessions = 999$$,
  '%permission denied%',
  'authenticated clients cannot directly edit authoritative stats'
);
select throws_like(
  $$select public.get_player_trust_projection_v2('20000000-0000-4000-8000-000000000901')$$,
  '%trust_projection_hidden%',
  'cross-player trust remains hidden while shadow flag is disabled'
);
reset role;

select * from finish();
rollback;
