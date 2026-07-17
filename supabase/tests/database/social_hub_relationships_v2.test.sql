create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

select has_function(
  'public',
  'list_social_relationships_v2',
  array['integer', 'uuid'],
  'inclusive Social Hub relationship read exists'
);
select function_privs_are(
  'public', 'list_social_relationships_v2', array['integer', 'uuid'],
  'authenticated', array['EXECUTE'],
  'authenticated clients may read their Social Hub'
);
select function_privs_are(
  'public', 'list_social_relationships_v2', array['integer', 'uuid'],
  'anon', array[]::text[],
  'anonymous clients cannot read Social Hub relationships'
);

update private.social_authority_config_v2
set reads_enabled = true,
    writes_enabled = true,
    updated_at = now()
where singleton;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('01000000-0000-4000-8000-000000001911', 'authenticated', 'authenticated', 'hub-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000001912', 'authenticated', 'authenticated', 'hub-b@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000001913', 'authenticated', 'authenticated', 'hub-c@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('01000000-0000-4000-8000-000000001911', 'Hub A'),
  ('01000000-0000-4000-8000-000000001912', 'Hub B'),
  ('01000000-0000-4000-8000-000000001913', 'Hub C');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('21000000-0000-4000-8000-000000001911', '01000000-0000-4000-8000-000000001911', '01000000-0000-4000-8000-000000001911', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000001912', '01000000-0000-4000-8000-000000001912', '01000000-0000-4000-8000-000000001912', 'active', 1, true, true),
  ('21000000-0000-4000-8000-000000001913', '01000000-0000-4000-8000-000000001913', '01000000-0000-4000-8000-000000001913', 'active', 1, true, true);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('31000000-0000-4000-8000-000000001911', '21000000-0000-4000-8000-000000001911', '01000000-0000-4000-8000-000000001911', 1, now()),
  ('31000000-0000-4000-8000-000000001912', '21000000-0000-4000-8000-000000001912', '01000000-0000-4000-8000-000000001912', 1, now()),
  ('31000000-0000-4000-8000-000000001913', '21000000-0000-4000-8000-000000001913', '01000000-0000-4000-8000-000000001913', 1, now());

insert into public.social_relationships_v2 (
  id, player_low_id, player_high_id, friendship_state, version, accepted_at
) values
  (
    private.social_relationship_id_v2(
      '21000000-0000-4000-8000-000000001911',
      '21000000-0000-4000-8000-000000001912'
    ),
    '21000000-0000-4000-8000-000000001911',
    '21000000-0000-4000-8000-000000001912',
    'accepted', 2, now()
  ),
  (
    private.social_relationship_id_v2(
      '21000000-0000-4000-8000-000000001911',
      '21000000-0000-4000-8000-000000001913'
    ),
    '21000000-0000-4000-8000-000000001911',
    '21000000-0000-4000-8000-000000001913',
    'none', 1, null
  );

insert into public.friendship_requests_v2 (
  id, relationship_id, requester_player_id, recipient_player_id,
  state, version, expires_at
) values (
  '42000000-0000-4000-8000-000000001913',
  private.social_relationship_id_v2(
    '21000000-0000-4000-8000-000000001911',
    '21000000-0000-4000-8000-000000001913'
  ),
  '21000000-0000-4000-8000-000000001911',
  '21000000-0000-4000-8000-000000001913',
  'pending', 1, now() + interval '1 hour'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000001911', true);

create temporary table hub_a as
select public.list_social_relationships_v2() as value;

select is(
  (select (value ->> 'contractVersion')::integer from hub_a),
  2,
  'Social Hub returns Core V2 contract version'
);
select is(
  (select jsonb_array_length(value -> 'items') from hub_a),
  2,
  'Social Hub combines accepted friendships and pending requests'
);
select is(
  (select value #>> '{items,0,friendship,label}' from hub_a),
  'friend',
  'accepted relationship is projected as friend'
);
select is(
  (select value #>> '{items,1,friendship,label}' from hub_a),
  'pending_outgoing',
  'requester sees an outgoing pending request'
);

select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000001913', true);
select is(
  (public.list_social_relationships_v2() #>> '{items,0,friendship,label}'),
  'pending_incoming',
  'recipient sees the same pending request as incoming'
);
select is(
  jsonb_array_length(public.list_social_relationships_v2(1, null) -> 'items'),
  1,
  'Social Hub enforces requested page size'
);

select * from finish();
rollback;
