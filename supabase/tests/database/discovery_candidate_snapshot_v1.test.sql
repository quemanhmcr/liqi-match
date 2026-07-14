create extension if not exists pgtap with schema extensions;

begin;

select plan(24);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000301', 'authenticated', 'authenticated', 'discover-a@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000302', 'authenticated', 'authenticated', 'discover-b@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000303', 'authenticated', 'authenticated', 'discover-c@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000304', 'authenticated', 'authenticated', 'discover-d@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000305', 'authenticated', 'authenticated', 'discover-e@example.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000306', 'authenticated', 'authenticated', 'discover-f@example.test', 'x', now(), now(), now());

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000301', 'Discover A'),
  ('00000000-0000-0000-0000-000000000302', 'Discover B'),
  ('00000000-0000-0000-0000-000000000303', 'Discover C'),
  ('00000000-0000-0000-0000-000000000304', 'Discover D'),
  ('00000000-0000-0000-0000-000000000305', 'Discover E'),
  ('00000000-0000-0000-0000-000000000306', 'Discover F');

insert into public.players (
  id, account_id, auth_user_id, lifecycle_state, lifecycle_version,
  discoverable, messaging_allowed
) values
  ('20000000-0000-4000-8000-000000000301', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000301', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000302', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000302', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000303', '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000303', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000304', '00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000304', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000305', '00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000305', 'active', 1, true, true),
  ('20000000-0000-4000-8000-000000000306', '00000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000306', 'suspended', 2, false, false);

insert into public.player_profiles_v1 (
  id, player_id, legacy_profile_id, version, completed_at
) values
  ('30000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-000000000301', '00000000-0000-0000-0000-000000000301', 3, now()),
  ('30000000-0000-4000-8000-000000000302', '20000000-0000-4000-8000-000000000302', '00000000-0000-0000-0000-000000000302', 4, now()),
  ('30000000-0000-4000-8000-000000000303', '20000000-0000-4000-8000-000000000303', '00000000-0000-0000-0000-000000000303', 5, now()),
  ('30000000-0000-4000-8000-000000000304', '20000000-0000-4000-8000-000000000304', '00000000-0000-0000-0000-000000000304', 6, now()),
  ('30000000-0000-4000-8000-000000000305', '20000000-0000-4000-8000-000000000305', '00000000-0000-0000-0000-000000000305', 7, now()),
  ('30000000-0000-4000-8000-000000000306', '20000000-0000-4000-8000-000000000306', '00000000-0000-0000-0000-000000000306', 8, now());

insert into public.ranks (id, slug, name, sort_order)
values ('40000000-0000-4000-8000-000000000301', 'cao_thu_test', 'Cao Thá»§ Test', 9301);
insert into public.roles (id, slug, name)
values ('50000000-0000-4000-8000-000000000301', 'support_test', 'Trá»£ Thá»§ Test');

insert into public.game_profiles (profile_id, rank_id, handle)
values
  ('00000000-0000-0000-0000-000000000302', '40000000-0000-4000-8000-000000000301', 'discover-b'),
  ('00000000-0000-0000-0000-000000000305', '40000000-0000-4000-8000-000000000301', 'discover-e');
insert into public.profile_roles (profile_id, role_id)
values
  ('00000000-0000-0000-0000-000000000302', '50000000-0000-4000-8000-000000000301'),
  ('00000000-0000-0000-0000-000000000305', '50000000-0000-4000-8000-000000000301');

insert into public.match_intents_v1 (
  id, player_id, state, filters, version, activated_at, expires_at
) values
  ('10000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-000000000301', 'active', '{"intentKind":"normal","mode":"normal","partyFormat":"duo","sessionPlan":"quick","roleSlugs":[],"timezone":"Asia/Bangkok"}', 1, now(), now() + interval '1 hour'),
  ('10000000-0000-4000-8000-000000000302', '20000000-0000-4000-8000-000000000302', 'active', '{"intentKind":"normal","mode":"normal","partyFormat":"duo","sessionPlan":"quick","roleSlugs":["support_test"],"timezone":"Asia/Bangkok"}', 1, now(), now() + interval '1 hour'),
  ('10000000-0000-4000-8000-000000000303', '20000000-0000-4000-8000-000000000303', 'active', '{"intentKind":"normal","mode":"normal","partyFormat":"duo","sessionPlan":"quick","roleSlugs":[],"timezone":"Asia/Bangkok"}', 1, now(), now() + interval '1 hour'),
  ('10000000-0000-4000-8000-000000000304', '20000000-0000-4000-8000-000000000304', 'active', '{"intentKind":"normal","mode":"normal","partyFormat":"duo","sessionPlan":"quick","roleSlugs":[],"timezone":"Asia/Bangkok"}', 1, now(), now() + interval '1 hour'),
  ('10000000-0000-4000-8000-000000000305', '20000000-0000-4000-8000-000000000305', 'active', '{"intentKind":"normal","mode":"normal","partyFormat":"duo","sessionPlan":"quick","roleSlugs":[],"timezone":"Asia/Bangkok"}', 1, now(), now() + interval '1 hour'),
  ('10000000-0000-4000-8000-000000000306', '20000000-0000-4000-8000-000000000306', 'active', '{"intentKind":"normal","mode":"normal","partyFormat":"duo","sessionPlan":"quick","roleSlugs":[],"timezone":"Asia/Bangkok"}', 1, now(), now() + interval '1 hour');

insert into public.blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000303');

insert into public.relationship_decisions_v1 (
  actor_player_id, target_player_id, match_intent_id, decision
) values
  ('20000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-000000000304', '10000000-0000-4000-8000-000000000301', 'pass'),
  ('20000000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-000000000305', '10000000-0000-4000-8000-000000000301', 'like');

update private.match_authority_config_v1
set reads_enabled = true;

update public.match_intents_v1
set expires_at = now() - interval '1 second'
where player_id = '20000000-0000-4000-8000-000000000306';
select private.expire_match_intent_v1('20000000-0000-4000-8000-000000000306');
select private.expire_match_intent_v1('20000000-0000-4000-8000-000000000306');
select is(
  (select state::text from public.match_intents_v1 where player_id = '20000000-0000-4000-8000-000000000306'),
  'expired',
  'expired Match Intent is transitioned before Discovery reads'
);
select is(
  (select version from public.match_intents_v1 where player_id = '20000000-0000-4000-8000-000000000306'),
  2,
  'repeating Match Intent expiry does not advance the version twice'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);

create temporary table discovery_page_one as
select public.list_discovery_candidates_v1(null, 1) as response;
create temporary table discovery_page_two as
select public.list_discovery_candidates_v1(
  (select (response ->> 'nextCursor')::uuid from discovery_page_one),
  1
) as response;
create temporary table discovery_page_two_retry as
select public.list_discovery_candidates_v1(
  (select (response ->> 'nextCursor')::uuid from discovery_page_one),
  1
) as response;

select is(
  (select jsonb_array_length(response -> 'items') from discovery_page_one),
  1,
  'first page obeys the requested limit'
);
select is(
  (select response #>> '{items,0,playerId}' from discovery_page_one),
  '20000000-0000-4000-8000-000000000302',
  'stable score and PlayerId ordering select B first'
);
select is(
  (select response #>> '{items,0,relationshipState}' from discovery_page_one),
  'none',
  'new candidate exposes authoritative none relationship state'
);
select ok(
  (select response ->> 'nextCursor' from discovery_page_one) is not null,
  'first page publishes an opaque next cursor'
);
select is(
  (select (response #>> '{snapshot,intentVersion}')::integer from discovery_page_one),
  1,
  'snapshot binds pagination to the active Match Intent version'
);
select is(
  (select jsonb_array_length(response -> 'items') from discovery_page_two),
  1,
  'second page returns the remaining candidate'
);
select is(
  (select response #>> '{items,0,playerId}' from discovery_page_two),
  '20000000-0000-4000-8000-000000000305',
  'already-liked E remains visible in the immutable snapshot'
);
select is(
  (select response #>> '{items,0,relationshipState}' from discovery_page_two),
  'liked',
  'already-liked candidate exposes liked state'
);
select is(
  (select (response #>> '{items,0,capabilities,canLike}')::boolean from discovery_page_two),
  false,
  'already-liked candidate cannot be liked twice'
);
select is(
  (select response ->> 'nextCursor' from discovery_page_two),
  null,
  'last page has no next cursor'
);
select is(
  (select response from discovery_page_two_retry),
  (select response from discovery_page_two),
  'cursor retry returns the identical semantic page'
);
select is(
  (select response #>> '{snapshot,snapshotId}' from discovery_page_two),
  (select response #>> '{snapshot,snapshotId}' from discovery_page_one),
  'all pages share one immutable snapshot identity'
);
select is(
  (select count(*)::integer from private.discovery_snapshot_candidates_v1),
  2,
  'snapshot persists exactly two eligible candidates'
);
select is(
  (
    select count(distinct candidate_player_id)::integer
    from private.discovery_snapshot_candidates_v1
  ),
  2,
  'snapshot contains no duplicate candidate'
);
select is(
  (
    select count(*)::integer
    from private.discovery_snapshot_candidates_v1
    where candidate_player_id = '20000000-0000-4000-8000-000000000303'
  ),
  0,
  'blocked candidate is excluded'
);
select is(
  (
    select count(*)::integer
    from private.discovery_snapshot_candidates_v1
    where candidate_player_id = '20000000-0000-4000-8000-000000000304'
  ),
  0,
  'passed candidate is excluded from a new snapshot'
);
select is(
  (
    select count(*)::integer
    from private.discovery_snapshot_candidates_v1
    where candidate_player_id = '20000000-0000-4000-8000-000000000306'
  ),
  0,
  'suspended candidate is excluded by lifecycle authority'
);
select is(
  (select response #>> '{items,0,profileSummary,profileId}' from discovery_page_one),
  '30000000-0000-4000-8000-000000000302',
  'candidate summary exposes canonical ProfileId rather than legacy profile row ID'
);
select is(
  (select (response #>> '{items,0,profileSummary,profileVersion}')::integer from discovery_page_one),
  4,
  'candidate summary snapshots authoritative profile version'
);
select is(
  (select response #>> '{items,0,profileSummary,primaryRole,slug}' from discovery_page_one),
  'support_test',
  'candidate summary snapshots deterministic presentation facts'
);

reset role;
update public.match_intents_v1
set version = version + 1
where player_id = '20000000-0000-4000-8000-000000000301';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
select throws_like(
  $$select public.list_discovery_candidates_v1(
    (select (response ->> 'nextCursor')::uuid from discovery_page_one),
    1
  )$$,
  '%stale_cursor%',
  'cursor becomes stale when the active Match Intent version changes'
);

reset role;
update private.match_authority_config_v1 set reads_enabled = false;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
select throws_like(
  $$select public.list_discovery_candidates_v1(null, 20)$$,
  '%service_unavailable%',
  'read kill switch prevents new authoritative snapshots'
);

reset role;
select * from finish();
rollback;
