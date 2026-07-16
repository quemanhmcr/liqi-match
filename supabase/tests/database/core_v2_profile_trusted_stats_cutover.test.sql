create extension if not exists pgtap with schema extensions;

begin;

select plan(11);

select has_function(
  'private',
  'reject_authenticated_trusted_stats_mutation_v2',
  array[]::text[],
  'trusted-stat mutation guard exists'
);
select has_trigger(
  'public',
  'profile_habits',
  'profile_habits_reject_trusted_stats_mutation_v2',
  'profile habits has a trusted-stat mutation guard'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values (
  '01000000-0000-4000-8000-000000000951',
  'authenticated',
  'authenticated',
  'trust-cutover@example.test',
  'x',
  now(),
  now(),
  now()
);
insert into public.profiles (id, display_name)
values ('01000000-0000-4000-8000-000000000951', 'Trust Cutover');
insert into public.profile_habits (
  profile_id, decision_style, session_length, seriousness,
  feedback_style, loss_response, comeback_response, media_summary
) values (
  '01000000-0000-4000-8000-000000000951',
  'team_vote',
  'medium',
  'balanced',
  'direct',
  'review',
  'reset',
  '{"profile_stats":{"matches":99,"rating":4.9,"reputation":99,"win_rate":88},"profile_status":"ready"}'::jsonb
);

-- Simulate the migration backfill for a row inserted after migration execution.
update public.profile_habits habits
set media_summary = jsonb_set(
  coalesce(habits.media_summary, '{}'::jsonb) - 'profile_stats',
  '{unverified_legacy}',
  (case
    when jsonb_typeof(habits.media_summary -> 'unverified_legacy') = 'object'
      then habits.media_summary -> 'unverified_legacy'
    else '{}'::jsonb
  end) || jsonb_build_object('profile_stats', habits.media_summary -> 'profile_stats'),
  true
)
where profile_id = '01000000-0000-4000-8000-000000000951';

select is(
  (select media_summary #>> '{unverified_legacy,profile_stats,matches}'
   from public.profile_habits
   where profile_id = '01000000-0000-4000-8000-000000000951'),
  '99',
  'legacy editable matches are preserved only as unverified history'
);
select is(
  (select media_summary -> 'profile_stats'
   from public.profile_habits
   where profile_id = '01000000-0000-4000-8000-000000000951'),
  null::jsonb,
  'legacy trusted-looking stats are removed from the root namespace'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000951', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'role', 'authenticated',
    'sub', '01000000-0000-4000-8000-000000000951'
  )::text,
  true
);

select throws_like(
  $$update public.profile_habits
    set media_summary = jsonb_set(media_summary, '{profile_stats}', '{"matches":100}'::jsonb, true)
    where profile_id = '01000000-0000-4000-8000-000000000951'$$,
  '%trusted_stats_read_only%',
  'authenticated clients cannot change legacy trusted-looking stats'
);
select lives_ok(
  $$update public.profile_habits
    set media_summary = jsonb_set(media_summary, '{profile_status}', '"busy"'::jsonb, true)
    where profile_id = '01000000-0000-4000-8000-000000000951'$$,
  'unrelated profile metadata remains editable when profile_stats is unchanged'
);
select is(
  (select media_summary -> 'profile_stats'
   from public.profile_habits
   where profile_id = '01000000-0000-4000-8000-000000000951'),
  null::jsonb,
  'rejected mutation does not restore root trusted-looking stats'
);
select is(
  (select media_summary #>> '{profile_status}'
   from public.profile_habits
   where profile_id = '01000000-0000-4000-8000-000000000951'),
  'busy',
  'allowed metadata mutation persists'
);
select throws_like(
  $$insert into public.profile_habits (
      profile_id, decision_style, session_length, seriousness,
      feedback_style, loss_response, comeback_response, media_summary
    ) values (
      '01000000-0000-4000-8000-000000000951',
      'team_vote', 'medium', 'balanced', 'direct', 'review', 'reset',
      '{"profile_stats":{"matches":100}}'::jsonb
    )$$,
  '%trusted_stats_read_only%',
  'authenticated clients cannot introduce trusted-looking stats on insert'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.reject_authenticated_trusted_stats_mutation_v2()',
    'EXECUTE'
  ),
  'authenticated clients cannot call the private guard directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.profile_habits', 'DELETE'),
  'authenticated clients cannot delete the onboarding/profile habit authority row'
);

select * from finish();
rollback;
