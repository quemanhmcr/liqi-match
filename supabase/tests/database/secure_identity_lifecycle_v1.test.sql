create extension if not exists pgtap with schema extensions;

begin;

select plan(31);

select has_table('public', 'players', 'canonical players table exists');
select has_table('public', 'player_profiles_v1', 'canonical player profile mapping exists');
select has_table('private', 'command_receipts_v1', 'durable command receipts exist');

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.players'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.players'::regclass and attname = 'account_id')
      ]::smallint[]
  ),
  'one auth subject maps to at most one player'
);

select isnt(
  has_table_privilege('authenticated', 'public.players', 'INSERT'),
  true,
  'clients cannot create player identities directly'
);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('01000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'identity-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'identity-b@example.test', 'x', now(), now(), now());

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000101', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '01000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'session_id', '09000000-0000-4000-8000-000000000101',
    'iat', extract(epoch from now() - interval '1 minute')::bigint,
    'exp', extract(epoch from now() + interval '1 hour')::bigint
  )::text,
  true
);

select is(
  public.bootstrap_authenticated_player_v1('bootstrap.identity.000000000101')->'lifecycle'->>'state',
  'onboarding',
  'bootstrap creates an authoritative onboarding player'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '01000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'session_id', '09000000-0000-4000-8000-000000000102',
    'iat', extract(epoch from now() - interval '1 minute')::bigint,
    'exp', extract(epoch from now() + interval '1 hour')::bigint
  )::text,
  true
);

select is(
  (public.bootstrap_authenticated_player_v1('bootstrap.identity.000000000101')->>'repeated')::boolean,
  true,
  'retrying bootstrap returns the durable receipt'
);

select is(
  public.bootstrap_authenticated_player_v1('bootstrap.identity.000000000101')->'principal'->>'sessionId',
  '09000000-0000-4000-8000-000000000102',
  'bootstrap replay refreshes the authenticated principal'
);

reset role;

select is(
  (select count(*)::integer from public.players where account_id = '01000000-0000-4000-8000-000000000101'),
  1,
  'bootstrap retry creates exactly one player identity'
);

select is(
  (select count(*)::integer from public.player_profiles_v1 profiles join public.players players on players.id = profiles.player_id where players.account_id = '01000000-0000-4000-8000-000000000101'),
  1,
  'bootstrap retry creates exactly one canonical profile identity'
);

select isnt(
  (select id from public.players where account_id = '01000000-0000-4000-8000-000000000101'),
  '01000000-0000-4000-8000-000000000101'::uuid,
  'AccountId and PlayerId are not conflated'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000101', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '01000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'session_id', '09000000-0000-4000-8000-000000000101',
    'iat', extract(epoch from now() - interval '1 minute')::bigint,
    'exp', extract(epoch from now() + interval '1 hour')::bigint
  )::text,
  true
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '01000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'session_id', '09000000-0000-4000-8000-000000000103',
    'iat', extract(epoch from now() - interval '1 minute')::bigint,
    'exp', extract(epoch from now() + interval '1 hour')::bigint
  )::text,
  true
);

select is(
  public.complete_player_onboarding_v1(
    '{
      "idempotencyKey": "onboarding.complete.000000000101",
      "expectedProfileVersion": 0,
      "profile": {
        "displayName": "Match Tester",
        "gameHandle": "Match Tester",
        "rankSlug": "master",
        "roleSlugs": ["jungle", "support"],
        "favoriteHeroSlugs": ["edras", "goverra", "heino"],
        "timezone": "Asia/Bangkok"
      },
      "legacyProfilePayload": {
        "display_name": "Match Tester",
        "handle": "Match Tester",
        "locale": "vi",
        "timezone": "Asia/Bangkok",
        "rank_slug": "master",
        "role_slugs": ["jungle", "support"],
        "heroes": [
          {"slug": "edras", "name": "Edras", "role_slug": "fighter"},
          {"slug": "goverra", "name": "Goverra", "role_slug": "mage"},
          {"slug": "heino", "name": "Heino", "role_slug": "mage"}
        ],
        "availability_slots": [
          {"day_of_week": 1, "starts_at": "18:00:00", "ends_at": "23:59:00"}
        ],
        "regions": ["global"],
        "languages": ["vi"],
        "habits": {
          "communication_channels": ["Voice khi cần"],
          "online_time_presets": ["Tối"],
          "decision_style": "Cùng trao đổi trước khi quyết định",
          "session_length": "3-5 trận",
          "team_goals": ["Leo rank nghiêm túc"],
          "seriousness": "Cân bằng",
          "strategy_styles": ["Ưu tiên kiểm soát mục tiêu"],
          "team_atmospheres": ["Nghiêm túc nhưng tôn trọng"],
          "feedback_style": "Chỉ nhắc ngắn gọn trong trận",
          "loss_response": "Nghỉ 5-15 phút",
          "comeback_response": "Theo quyết định chung của đội"
        },
        "media_summary": {"avatar": false, "cover": false, "wall_count": 0}
      }
    }'::jsonb
  )->'lifecycle'->>'state',
  'active',
  'authoritative completion transitions onboarding to active'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '01000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'session_id', '09000000-0000-4000-8000-000000000104',
    'iat', extract(epoch from now() - interval '1 minute')::bigint,
    'exp', extract(epoch from now() + interval '1 hour')::bigint
  )::text,
  true
);

select is(
  (public.complete_player_onboarding_v1(
    '{
      "idempotencyKey": "onboarding.complete.000000000101",
      "expectedProfileVersion": 0,
      "profile": {
        "displayName": "Match Tester",
        "gameHandle": "Match Tester",
        "rankSlug": "master",
        "roleSlugs": ["jungle", "support"],
        "favoriteHeroSlugs": ["edras", "goverra", "heino"],
        "timezone": "Asia/Bangkok"
      },
      "legacyProfilePayload": {
        "display_name": "Match Tester",
        "handle": "Match Tester",
        "locale": "vi",
        "timezone": "Asia/Bangkok",
        "rank_slug": "master",
        "role_slugs": ["jungle", "support"],
        "heroes": [
          {"slug": "edras", "name": "Edras", "role_slug": "fighter"},
          {"slug": "goverra", "name": "Goverra", "role_slug": "mage"},
          {"slug": "heino", "name": "Heino", "role_slug": "mage"}
        ],
        "availability_slots": [{"day_of_week": 1, "starts_at": "18:00:00", "ends_at": "23:59:00"}],
        "regions": ["global"],
        "languages": ["vi"],
        "habits": {
          "communication_channels": ["Voice khi cần"],
          "online_time_presets": ["Tối"],
          "decision_style": "Cùng trao đổi trước khi quyết định",
          "session_length": "3-5 trận",
          "team_goals": ["Leo rank nghiêm túc"],
          "seriousness": "Cân bằng",
          "strategy_styles": ["Ưu tiên kiểm soát mục tiêu"],
          "team_atmospheres": ["Nghiêm túc nhưng tôn trọng"],
          "feedback_style": "Chỉ nhắc ngắn gọn trong trận",
          "loss_response": "Nghỉ 5-15 phút",
          "comeback_response": "Theo quyết định chung của đội"
        },
        "media_summary": {"avatar": false, "cover": false, "wall_count": 0}
      }
    }'::jsonb
  )->>'repeated')::boolean,
  true,
  'retrying completion returns the original durable result'
);

select is(
  public.complete_player_onboarding_v1(
    jsonb_build_object(
      'idempotencyKey', 'onboarding.complete.000000000101',
      'expectedProfileVersion', 0,
      'profile', jsonb_build_object(
        'displayName', 'Match Tester',
        'gameHandle', 'Match Tester',
        'rankSlug', 'master',
        'roleSlugs', jsonb_build_array('jungle', 'support'),
        'favoriteHeroSlugs', jsonb_build_array('edras', 'goverra', 'heino'),
        'timezone', 'Asia/Bangkok'
      ),
      'legacyProfilePayload', jsonb_build_object(
        'display_name', 'Match Tester',
        'handle', 'Match Tester',
        'locale', 'vi',
        'timezone', 'Asia/Bangkok',
        'rank_slug', 'master',
        'role_slugs', jsonb_build_array('jungle', 'support'),
        'heroes', jsonb_build_array(
          jsonb_build_object('slug', 'edras', 'name', 'Edras', 'role_slug', 'fighter'),
          jsonb_build_object('slug', 'goverra', 'name', 'Goverra', 'role_slug', 'mage'),
          jsonb_build_object('slug', 'heino', 'name', 'Heino', 'role_slug', 'mage')
        ),
        'availability_slots', jsonb_build_array(
          jsonb_build_object('day_of_week', 1, 'starts_at', '18:00:00', 'ends_at', '23:59:00')
        ),
        'regions', jsonb_build_array('global'),
        'languages', jsonb_build_array('vi'),
        'habits', jsonb_build_object(
          'communication_channels', jsonb_build_array('Voice khi cần'),
          'online_time_presets', jsonb_build_array('Tối'),
          'decision_style', 'Cùng trao đổi trước khi quyết định',
          'session_length', '3-5 trận',
          'team_goals', jsonb_build_array('Leo rank nghiêm túc'),
          'seriousness', 'Cân bằng',
          'strategy_styles', jsonb_build_array('Ưu tiên kiểm soát mục tiêu'),
          'team_atmospheres', jsonb_build_array('Nghiêm túc nhưng tôn trọng'),
          'feedback_style', 'Chỉ nhắc ngắn gọn trong trận',
          'loss_response', 'Nghỉ 5-15 phút',
          'comeback_response', 'Theo quyết định chung của đội'
        ),
        'media_summary', jsonb_build_object('avatar', false, 'cover', false, 'wall_count', 0)
      )
    )
  )->'principal'->>'sessionId',
  '09000000-0000-4000-8000-000000000104',
  'completion replay refreshes the authenticated principal'
);

select is(
  public.bootstrap_authenticated_player_v1('bootstrap.identity.000000000101')->'lifecycle'->>'state',
  'active',
  'bootstrap replay refreshes the current lifecycle instead of returning onboarding'
);

reset role;

select is(
  (select count(*)::integer from private.outbox_events where event_type = 'player.activated.v1'),
  1,
  'completion retry emits exactly one activation event'
);

select is(
  (select version::integer from public.player_profiles_v1 profiles join public.players players on players.id = profiles.player_id where players.account_id = '01000000-0000-4000-8000-000000000101'),
  1,
  'completion increments canonical profile version exactly once'
);

select ok(
  private.is_player_discovery_eligible_v1(
    (select id from public.players where account_id = '01000000-0000-4000-8000-000000000101')
  ),
  'active lifecycle snapshot is discovery eligible'
);

select ok(
  private.is_player_messaging_allowed_v1(
    (select id from public.players where account_id = '01000000-0000-4000-8000-000000000101')
  ),
  'active lifecycle snapshot authorizes messaging'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000102', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '01000000-0000-4000-8000-000000000102',
    'role', 'authenticated',
    'session_id', '09000000-0000-4000-8000-000000000102',
    'iat', extract(epoch from now() - interval '1 minute')::bigint,
    'exp', extract(epoch from now() + interval '1 hour')::bigint
  )::text,
  true
);
select public.bootstrap_authenticated_player_v1('bootstrap.identity.000000000102');

select throws_like(
  $$select public.complete_player_onboarding_v1(
    jsonb_set(
      jsonb_set(
        $command${
          "idempotencyKey": "onboarding.complete.000000000102",
          "expectedProfileVersion": 0,
          "profile": {
            "displayName": "Version Conflict",
            "gameHandle": "Version Conflict",
            "rankSlug": "master",
            "roleSlugs": ["jungle"],
            "favoriteHeroSlugs": ["edras", "goverra", "heino"],
            "timezone": "Asia/Bangkok"
          },
          "legacyProfilePayload": {}
        }$command$::jsonb,
        '{expectedProfileVersion}',
        '9'::jsonb
      ),
      '{legacyProfilePayload}',
      $legacy${
        "display_name":"Version Conflict","handle":"Version Conflict","locale":"vi","timezone":"Asia/Bangkok","rank_slug":"master","role_slugs":["jungle"],
        "heroes":[{"slug":"edras","name":"Edras","role_slug":"fighter"},{"slug":"goverra","name":"Goverra","role_slug":"mage"},{"slug":"heino","name":"Heino","role_slug":"mage"}],
        "availability_slots":[{"day_of_week":1,"starts_at":"18:00:00","ends_at":"23:59:00"}],"regions":["global"],"languages":["vi"],
        "habits":{"communication_channels":["Voice khi cần"],"online_time_presets":["Tối"],"decision_style":"Cùng trao đổi trước khi quyết định","session_length":"3-5 trận","team_goals":["Leo rank nghiêm túc"],"seriousness":"Cân bằng","strategy_styles":["Ưu tiên kiểm soát mục tiêu"],"team_atmospheres":["Nghiêm túc nhưng tôn trọng"],"feedback_style":"Chỉ nhắc ngắn gọn trong trận","loss_response":"Nghỉ 5-15 phút","comeback_response":"Theo quyết định chung của đội"},
        "media_summary":{"avatar":false,"cover":false,"wall_count":0}
      }$legacy$::jsonb
    )
  )$$,
  '%profile_version_conflict%',
  'concurrent profile version conflict returns a structured error'
);

reset role;

select throws_like(
  format(
    'select private.transition_player_lifecycle_v1(%L, %s, %L, false, false, null)',
    (select id from public.players where account_id = '01000000-0000-4000-8000-000000000102'),
    (select lifecycle_version from public.players where account_id = '01000000-0000-4000-8000-000000000102'),
    'deleted'
  ),
  '%invalid_lifecycle_transition%',
  'forbidden lifecycle transition is rejected'
);

select isnt(
  private.is_player_discovery_eligible_v1(
    (select id from public.players where account_id = '01000000-0000-4000-8000-000000000102')
  ),
  true,
  'onboarding player is not discovery eligible'
);

select isnt(
  private.is_player_messaging_allowed_v1(
    (select id from public.players where account_id = '01000000-0000-4000-8000-000000000102')
  ),
  true,
  'onboarding player cannot send messages'
);

delete from auth.users
where id = '01000000-0000-4000-8000-000000000101';

select is(
  (
    select jsonb_build_object(
      'accountId', account_id,
      'authUserId', auth_user_id
    )
    from public.players
    where account_id = '01000000-0000-4000-8000-000000000101'
  ),
  '{"accountId":"01000000-0000-4000-8000-000000000101","authUserId":null}'::jsonb,
  'auth deletion retains immutable AccountId while detaching the live auth FK'
);

select is(
  (
    select jsonb_build_object(
      'state', lifecycle_state,
      'discoverable', discoverable,
      'messagingAllowed', messaging_allowed
    )
    from public.players
    where account_id = '01000000-0000-4000-8000-000000000101'
  ),
  '{"state":"deleted","discoverable":false,"messagingAllowed":false}'::jsonb,
  'auth deletion creates a non-discoverable, non-messaging tombstone'
);

select is(
  (
    select jsonb_build_object(
      'profiles', (
        select count(*)::integer
        from public.player_profiles_v1 profiles
        where profiles.player_id = players.id
      ),
      'deletedEvents', (
        select count(*)::integer
        from private.outbox_events events
        where events.aggregate_id = players.id
          and events.event_type = 'player.deleted.v1'
      )
    )
    from public.players players
    where players.account_id = '01000000-0000-4000-8000-000000000101'
  ),
  '{"profiles":1,"deletedEvents":1}'::jsonb,
  'auth deletion preserves canonical ProfileId and emits exactly one deleted event'
);


select is(
  public.get_player_lifecycle_snapshot_v1(
    '01000000-0000-4000-8000-000000000101',
    false
  )->>'state',
  'deleted',
  'account provider returns the authoritative tombstone lifecycle'
);

select is(
  public.get_player_lifecycle_snapshot_by_player_v1(
    (
      select id
      from public.players
      where account_id = '01000000-0000-4000-8000-000000000102'
    ),
    true
  )->>'state',
  'onboarding',
  'player provider lock path returns the authoritative lifecycle'
);

select is(
  public.get_player_lifecycle_snapshot_by_player_v1(
    (
      select id
      from public.players
      where account_id = '01000000-0000-4000-8000-000000000102'
    ),
    true
  )->>'messagingAllowed',
  'false',
  'provider snapshot includes authoritative messaging capability'
);

select is(
  public.get_player_lifecycle_snapshot_v1(
    '01000000-0000-4000-8000-000000000102',
    true
  )->>'playerId',
  (
    select id::text
    from public.players
    where account_id = '01000000-0000-4000-8000-000000000102'
  ),
  'account and player provider functions resolve the same canonical PlayerId'
);

select is(
  public.get_player_lifecycle_snapshot_by_player_v1(
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    true
  ),
  null,
  'provider returns null for an unknown player'
);

select * from finish();

rollback;
