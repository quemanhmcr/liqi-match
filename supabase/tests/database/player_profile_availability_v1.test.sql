begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
) values (
  '01000000-0000-4000-8000-000000000881',
  'authenticated',
  'authenticated',
  'availability@example.test',
  'x',
  now(),
  now(),
  now()
);

insert into public.profiles (id, display_name, bio, timezone)
values (
  '01000000-0000-4000-8000-000000000881',
  'Availability Player',
  'Preserved bio',
  'UTC'
);

insert into public.players (
  id,
  account_id,
  auth_user_id,
  lifecycle_state,
  lifecycle_version,
  discoverable,
  messaging_allowed
) values (
  '20000000-0000-4000-8000-000000000881',
  '01000000-0000-4000-8000-000000000881',
  '01000000-0000-4000-8000-000000000881',
  'active',
  4,
  true,
  true
);

insert into public.player_profiles_v1 (
  id,
  player_id,
  legacy_profile_id,
  version,
  completed_at
) values (
  '30000000-0000-4000-8000-000000000881',
  '20000000-0000-4000-8000-000000000881',
  '01000000-0000-4000-8000-000000000881',
  0,
  now()
);

create temporary table availability_results (
  name text primary key,
  response jsonb not null
);
grant all on availability_results to authenticated;

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_own_player_profile_availability_v1()',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.update_player_profile_availability_v1(jsonb)',
    'EXECUTE'
  ),
  'authenticated clients can read and update their own Availability section'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_own_player_profile_availability_v1()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.update_player_profile_availability_v1(jsonb)',
    'EXECUTE'
  ),
  'anonymous clients cannot read or update Availability'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '01000000-0000-4000-8000-000000000881',
  true
);

select is(
  public.get_own_player_profile_availability_v1()->'availability',
  null,
  'Availability starts explicitly absent when no slots are persisted'
);

select is(
  (
    select count(*)::integer
    from jsonb_object_keys(public.get_own_player_profile_availability_v1())
  ),
  4,
  'Availability read returns the exact four-field snapshot contract'
);

insert into availability_results (name, response)
select
  'first',
  public.update_player_profile_availability_v1(
    jsonb_build_object(
      'availability', jsonb_build_object(
        'slots', jsonb_build_array(
          jsonb_build_object(
            'dayOfWeek', 1,
            'startMinute', 1080,
            'endMinute', 1440
          ),
          jsonb_build_object(
            'dayOfWeek', 2,
            'startMinute', 0,
            'endMinute', 180
          )
        ),
        'timezone', 'Asia/Ho_Chi_Minh'
      ),
      'expectedProfileVersion', 0,
      'idempotencyKey', 'profile.availability.000000000881.v0'
    )
  );

select is(
  (select response->>'repeated' from availability_results where name = 'first'),
  'false',
  'first Availability command is not a replay'
);

select is(
  (select (response->>'profileVersion')::integer from availability_results where name = 'first'),
  1,
  'Availability command increments canonical profile version exactly once'
);

select is(
  (select response #>> '{availability,timezone}' from availability_results where name = 'first'),
  'Asia/Ho_Chi_Minh',
  'Availability receipt returns the canonical timezone'
);

select is(
  (
    select jsonb_array_length(response #> '{availability,slots}')
    from availability_results
    where name = 'first'
  ),
  2,
  'Availability receipt returns both canonical slots'
);

select is(
  (
    select (response #>> '{availability,slots,0,endMinute}')::integer
    from availability_results
    where name = 'first'
  ),
  1440,
  'Availability receipt preserves the canonical end-of-day minute'
);

reset role;

select is(
  (select timezone from public.profiles where id = '01000000-0000-4000-8000-000000000881'),
  'Asia/Ho_Chi_Minh',
  'Availability command updates the legacy timezone projection atomically'
);

select is(
  (select display_name from public.profiles where id = '01000000-0000-4000-8000-000000000881'),
  'Availability Player',
  'Availability command preserves unrelated profile fields'
);

select is(
  (
    select count(*)::integer
    from public.availability_slots
    where profile_id = '01000000-0000-4000-8000-000000000881'
  ),
  2,
  'Availability command replaces the legacy slot projection'
);

select is(
  (
    select ends_at::text
    from public.availability_slots
    where profile_id = '01000000-0000-4000-8000-000000000881'
      and day_of_week = 1
  ),
  '23:59:59',
  'canonical minute 1440 is clamped to the legacy 23:59:59 bridge'
);

select is(
  (
    select starts_at::text
    from public.availability_slots
    where profile_id = '01000000-0000-4000-8000-000000000881'
      and day_of_week = 2
  ),
  '00:00:00',
  'next-day canonical slot begins at midnight'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '01000000-0000-4000-8000-000000000881',
  true
);

insert into availability_results (name, response)
select
  'replay',
  public.update_player_profile_availability_v1(
    jsonb_build_object(
      'availability', jsonb_build_object(
        'slots', jsonb_build_array(
          jsonb_build_object(
            'dayOfWeek', 1,
            'startMinute', 1080,
            'endMinute', 1440
          ),
          jsonb_build_object(
            'dayOfWeek', 2,
            'startMinute', 0,
            'endMinute', 180
          )
        ),
        'timezone', 'Asia/Ho_Chi_Minh'
      ),
      'expectedProfileVersion', 0,
      'idempotencyKey', 'profile.availability.000000000881.v0'
    )
  );

select is(
  (select response->>'repeated' from availability_results where name = 'replay'),
  'true',
  'retry with the same command key returns a durable replay receipt'
);

reset role;

select is(
  (
    select version::integer
    from public.player_profiles_v1
    where player_id = '20000000-0000-4000-8000-000000000881'
  ),
  1,
  'replay does not increment profile version again'
);

select is(
  (
    select count(*)::integer
    from private.outbox_events
    where event_type = 'player.profile_updated.v1'
      and aggregate_id = '20000000-0000-4000-8000-000000000881'
  ),
  1,
  'first Availability mutation emits exactly one profile-updated event'
);

select is(
  (
    select count(*)::integer
    from private.audit_logs
    where action = 'player_profile_availability_updated_v1'
      and target_id = '30000000-0000-4000-8000-000000000881'
  ),
  1,
  'first Availability mutation writes one audit record'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '01000000-0000-4000-8000-000000000881',
  true
);

select throws_like(
  $$select public.update_player_profile_availability_v1(
    '{
      "availability": {
        "slots": [{"dayOfWeek":3,"startMinute":60,"endMinute":120}],
        "timezone":"UTC"
      },
      "expectedProfileVersion":0,
      "idempotencyKey":"profile.availability.stale.000000000881"
    }'::jsonb
  )$$,
  '%profile_version_conflict%',
  'stale Availability command returns a profile version conflict'
);

select throws_like(
  $$select public.update_player_profile_availability_v1(
    '{
      "availability": {
        "slots": [
          {"dayOfWeek":3,"startMinute":60,"endMinute":180},
          {"dayOfWeek":3,"startMinute":120,"endMinute":240}
        ],
        "timezone":"UTC"
      },
      "expectedProfileVersion":1,
      "idempotencyKey":"profile.availability.overlap.000000000881"
    }'::jsonb
  )$$,
  '%validation_failed%',
  'overlapping Availability slots are rejected before mutation'
);

select throws_like(
  $$select public.update_player_profile_availability_v1(
    '{
      "availability": {
        "slots": [{"dayOfWeek":4,"startMinute":60,"endMinute":120}],
        "timezone":"UTC"
      },
      "expectedProfileVersion":1,
      "idempotencyKey":"profile.availability.000000000881.v0"
    }'::jsonb
  )$$,
  '%idempotency_key_reused%',
  'reusing an Availability key for a different payload is rejected'
);

insert into availability_results (name, response)
select
  'clear',
  public.update_player_profile_availability_v1(
    jsonb_build_object(
      'availability', null,
      'expectedProfileVersion', 1,
      'idempotencyKey', 'profile.availability.clear.000000000881.v1'
    )
  );

select is(
  (select (response->>'profileVersion')::integer from availability_results where name = 'clear'),
  2,
  'clearing Availability increments canonical profile version'
);

select is(
  (select response->'availability' from availability_results where name = 'clear'),
  null,
  'clearing Availability returns an explicit null snapshot'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.availability_slots
    where profile_id = '01000000-0000-4000-8000-000000000881'
  ),
  0,
  'clearing Availability removes every legacy slot'
);

select is(
  (
    select count(*)::integer
    from private.outbox_events
    where event_type = 'player.profile_updated.v1'
      and aggregate_id = '20000000-0000-4000-8000-000000000881'
  ),
  2,
  'clear emits one additional profile-updated event'
);

update public.players
set lifecycle_state = 'suspended',
    lifecycle_version = lifecycle_version + 1,
    discoverable = false,
    messaging_allowed = false,
    suspension_reason_code = 'trust.safety_review'
where id = '20000000-0000-4000-8000-000000000881';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '01000000-0000-4000-8000-000000000881',
  true
);

select throws_like(
  $$select public.update_player_profile_availability_v1(
    '{
      "availability": {
        "slots": [{"dayOfWeek":5,"startMinute":60,"endMinute":120}],
        "timezone":"UTC"
      },
      "expectedProfileVersion":2,
      "idempotencyKey":"profile.availability.suspended.000000000881"
    }'::jsonb
  )$$,
  '%player_suspended%',
  'suspended players cannot mutate Availability'
);

reset role;
select * from finish();
rollback;
