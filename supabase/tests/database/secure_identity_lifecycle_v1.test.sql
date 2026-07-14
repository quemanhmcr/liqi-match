create extension if not exists pgtap with schema extensions;

begin;

select plan(57);

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



set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000101', true);
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
  public.get_own_player_profile_identity_v1()->>'profileId',
  (
    select id::text
    from public.player_profiles_v1
    where player_id = '20000000-0000-4000-8000-000000000101'
  ),
  'profile identity read returns the canonical ProfileId'
);

select is(
  (
    public.update_player_profile_identity_v1(
      jsonb_build_object(
        'expectedProfileVersion', 1,
        'idempotencyKey', 'profile.identity.000000000101.v1',
        'identity', jsonb_build_object(
          'bio', 'Atomic profile identity',
          'displayName', 'Versioned Player',
          'genderId', 'hidden',
          'stats', jsonb_build_object(
            'matches', 320,
            'rating', 4.7,
            'reputation', 96,
            'winRate', 61
          ),
          'status', 'ready'
        )
      )
    )->>'profileVersion'
  )::integer,
  2,
  'profile identity update increments the canonical profile version'
);

select is(
  (
    select jsonb_build_object(
      'displayName', profiles.display_name,
      'bio', profiles.bio,
      'genderId', habits.media_summary #>> '{profile_basics,gender}',
      'status', habits.media_summary->>'profile_status',
      'matches', (habits.media_summary #>> '{profile_stats,matches}')::integer,
      'winRate', (habits.media_summary #>> '{profile_stats,win_rate}')::integer
    )
    from public.profiles profiles
    join public.profile_habits habits on habits.profile_id = profiles.id
    where profiles.id = '01000000-0000-4000-8000-000000000101'
  ),
  '{"displayName":"Versioned Player","bio":"Atomic profile identity","genderId":"hidden","status":"ready","matches":320,"winRate":61}'::jsonb,
  'profile identity command updates the legacy projection atomically'
);

select is(
  (
    public.update_player_profile_identity_v1(
      jsonb_build_object(
        'expectedProfileVersion', 1,
        'idempotencyKey', 'profile.identity.000000000101.v1',
        'identity', jsonb_build_object(
          'bio', 'Atomic profile identity',
          'displayName', 'Versioned Player',
          'genderId', 'hidden',
          'stats', jsonb_build_object(
            'matches', 320,
            'rating', 4.7,
            'reputation', 96,
            'winRate', 61
          ),
          'status', 'ready'
        )
      )
    )->>'repeated'
  )::boolean,
  true,
  'profile identity retry returns the durable receipt'
);

select is(
  (
    select version::integer
    from public.player_profiles_v1
    where player_id = '20000000-0000-4000-8000-000000000101'
  ),
  2,
  'profile identity retry does not increment the version twice'
);

select is(
  (
    select count(*)::integer
    from private.outbox_events
    where event_type = 'player.profile_updated.v1'
      and aggregate_id = '20000000-0000-4000-8000-000000000101'
  ),
  1,
  'profile identity retry emits exactly one profile-updated event'
);

select throws_like(
  $$select public.update_player_profile_identity_v1(
    jsonb_build_object(
      'expectedProfileVersion', 1,
      'idempotencyKey', 'profile.identity.stale.000000000101',
      'identity', jsonb_build_object(
        'bio', 'Stale update',
        'displayName', 'Stale Player',
        'genderId', null,
        'stats', jsonb_build_object(
          'matches', 1,
          'rating', 1,
          'reputation', 1,
          'winRate', 1
        ),
        'status', null
      )
    )
  )$$,
  '%profile_version_conflict%',
  'stale profile version returns a structured conflict'
);

select throws_like(
  $$select public.update_player_profile_identity_v1(
    jsonb_build_object(
      'expectedProfileVersion', 1,
      'idempotencyKey', 'profile.identity.000000000101.v1',
      'identity', jsonb_build_object(
        'bio', 'Different body',
        'displayName', 'Different Player',
        'genderId', null,
        'stats', jsonb_build_object(
          'matches', 2,
          'rating', 2,
          'reputation', 2,
          'winRate', 2
        ),
        'status', null
      )
    )
  )$$,
  '%idempotency_key_reused%',
  'profile identity key cannot be reused with a different request'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '01000000-0000-4000-8000-000000000101', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '01000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'session_id', '09000000-0000-4000-8000-000000000105',
    'iat', extract(epoch from now() - interval '1 minute')::bigint,
    'exp', extract(epoch from now() + interval '1 hour')::bigint
  )::text,
  true
);

select is(
  public.request_player_deletion_v1(
    jsonb_build_object(
      'confirmation', 'DELETE',
      'expectedLifecycleVersion', (
        select lifecycle_version
        from public.players
        where account_id = '01000000-0000-4000-8000-000000000101'
      ),
      'idempotencyKey', 'account.delete.000000000101'
    )
  )->'lifecycle'->>'state',
  'deleting',
  'deletion request transitions the active player to deleting'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '01000000-0000-4000-8000-000000000101',
    'role', 'authenticated',
    'session_id', '09000000-0000-4000-8000-000000000106',
    'iat', extract(epoch from now() - interval '1 minute')::bigint,
    'exp', extract(epoch from now() + interval '1 hour')::bigint
  )::text,
  true
);

select is(
  (public.request_player_deletion_v1(
    jsonb_build_object(
      'confirmation', 'DELETE',
      'expectedLifecycleVersion', 3,
      'idempotencyKey', 'account.delete.000000000101'
    )
  )->>'repeated')::boolean,
  true,
  'deletion retry returns the durable receipt'
);

select is(
  public.request_player_deletion_v1(
    jsonb_build_object(
      'confirmation', 'DELETE',
      'expectedLifecycleVersion', 3,
      'idempotencyKey', 'account.delete.000000000101'
    )
  )->'principal'->>'sessionId',
  '09000000-0000-4000-8000-000000000106',
  'deletion replay refreshes the authenticated principal'
);

select throws_like(
  $$select public.request_player_deletion_v1(
    jsonb_build_object(
      'confirmation', 'DELETE',
      'expectedLifecycleVersion', 3,
      'idempotencyKey', 'account.delete.stale.000000000101'
    )
  )$$,
  '%lifecycle_version_conflict%',
  'stale deletion lifecycle version returns a structured conflict'
);


select is(
  public.request_player_deletion_v1(
    jsonb_build_object(
      'confirmation', 'DELETE',
      'expectedLifecycleVersion', 4,
      'idempotencyKey', 'account.delete.resume.v4.000000000101'
    )
  )->'lifecycle'->>'state',
  'deleting',
  'a resumed cleanup request accepts the current deleting lifecycle version'
);

select throws_like(
  $$select public.request_player_deletion_v1(
    jsonb_build_object(
      'confirmation', 'delete',
      'expectedLifecycleVersion', 4,
      'idempotencyKey', 'account.delete.invalid.000000000101'
    )
  )$$,
  '%validation_failed%',
  'deletion command rejects missing explicit confirmation'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.outbox_events events
    join public.players players on players.id = events.aggregate_id
    where players.account_id = '01000000-0000-4000-8000-000000000101'
      and events.event_type = 'player.deletion_requested.v1'
  ),
  1,
  'deletion retries emit exactly one deletion-requested event'
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
  '{"state":"deleting","discoverable":false,"messagingAllowed":false}'::jsonb,
  'deleting lifecycle immediately disables discovery and messaging'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.request_player_deletion_v1(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.request_player_deletion_v1(jsonb)',
    'EXECUTE'
  ),
  'deletion request command is authenticated-only'
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
  public.resolve_player_identity_v1(
    '01000000-0000-4000-8000-000000000102',
    true
  ),
  (
    select jsonb_build_object(
      'accountId', players.account_id,
      'playerId', players.id,
      'profileId', profiles.id
    )
    from public.players players
    join public.player_profiles_v1 profiles on profiles.player_id = players.id
    where players.account_id = '01000000-0000-4000-8000-000000000102'
  ),
  'identity provider resolves exact AccountId to PlayerId to ProfileId mapping'
);

select is(
  jsonb_object_length(
    public.get_player_lifecycle_snapshot_v1(
      (
        select id
        from public.players
        where account_id = '01000000-0000-4000-8000-000000000102'
      ),
      true
    )
  ),
  7,
  'lifecycle provider returns exactly the seven PlayerLifecycleSnapshotV1 fields'
);

select is(
  public.get_player_lifecycle_snapshot_v1(
    (
      select id
      from public.players
      where account_id = '01000000-0000-4000-8000-000000000102'
    ),
    true
  )->>'state',
  'onboarding',
  'PlayerId lock path returns the authoritative lifecycle'
);

select is(
  public.get_player_lifecycle_snapshot_v1(
    (
      select id
      from public.players
      where account_id = '01000000-0000-4000-8000-000000000102'
    ),
    true
  )->>'messagingAllowed',
  'false',
  'lifecycle snapshot includes authoritative messaging capability'
);

select is(
  public.get_player_profile_version_v1(
    (
      select profiles.id
      from public.player_profiles_v1 profiles
      join public.players players on players.id = profiles.player_id
      where players.account_id = '01000000-0000-4000-8000-000000000102'
    ),
    true
  )->>'version',
  '0',
  'ProfileId lock path returns authoritative optimistic version'
);

select is(
  public.get_player_lifecycle_snapshot_by_player_v1(
    (
      select id
      from public.players
      where account_id = '01000000-0000-4000-8000-000000000102'
    ),
    false
  ),
  public.get_player_lifecycle_snapshot_v1(
    (
      select id
      from public.players
      where account_id = '01000000-0000-4000-8000-000000000102'
    ),
    false
  ),
  'compatibility transport delegates to the canonical lifecycle provider'
);

select is(
  public.resolve_player_identity_v1(
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    true
  ),
  null,
  'identity provider returns null for an unknown account'
);

select is(
  public.get_player_lifecycle_snapshot_v1(
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    true
  ),
  null,
  'lifecycle provider returns null for an unknown player'
);

select is(
  public.get_player_profile_version_v1(
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    true
  ),
  null,
  'profile version provider returns null for an unknown profile'
);


insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
values
  ('01000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'discoverable-a@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000000104', 'authenticated', 'authenticated', 'discoverable-b@example.test', 'x', now(), now(), now()),
  ('01000000-0000-4000-8000-000000000105', 'authenticated', 'authenticated', 'hidden@example.test', 'x', now(), now(), now());

insert into public.players (
  id,
  account_id,
  auth_user_id,
  lifecycle_state,
  lifecycle_version,
  discoverable,
  messaging_allowed,
  updated_at
)
values
  ('20000000-0000-4000-8000-000000000103', '01000000-0000-4000-8000-000000000103', '01000000-0000-4000-8000-000000000103', 'active', 2, true, true, '2026-07-14T08:03:00Z'),
  ('20000000-0000-4000-8000-000000000104', '01000000-0000-4000-8000-000000000104', '01000000-0000-4000-8000-000000000104', 'active', 3, true, true, '2026-07-14T08:04:00Z'),
  ('20000000-0000-4000-8000-000000000105', '01000000-0000-4000-8000-000000000105', '01000000-0000-4000-8000-000000000105', 'active', 2, false, true, '2026-07-14T08:05:00Z');

insert into public.player_profiles_v1 (id, player_id)
values
  ('30000000-0000-4000-8000-000000000103', '20000000-0000-4000-8000-000000000103'),
  ('30000000-0000-4000-8000-000000000104', '20000000-0000-4000-8000-000000000104'),
  ('30000000-0000-4000-8000-000000000105', '20000000-0000-4000-8000-000000000105');

select is(
  (
    select count(*)::integer
    from public.list_discoverable_player_lifecycle_v1(null)
  ),
  2,
  'discoverable lifecycle list includes only live active discoverable players'
);

select ok(
  not exists (
    select 1
    from public.list_discoverable_player_lifecycle_v1(null) snapshots
    where jsonb_object_length(snapshots) <> 7
      or snapshots->>'state' <> 'active'
      or snapshots->>'discoverable' <> 'true'
  ),
  'discoverable lifecycle list returns exact PlayerLifecycleSnapshotV1 rows'
);

select is(
  (
    select array_agg(snapshots->>'playerId')
    from public.list_discoverable_player_lifecycle_v1(null) snapshots
  ),
  array[
    '20000000-0000-4000-8000-000000000103',
    '20000000-0000-4000-8000-000000000104'
  ]::text[],
  'discoverable lifecycle list is deterministically ordered by PlayerId'
);

select is(
  (
    select array_agg(snapshots->>'playerId')
    from public.list_discoverable_player_lifecycle_v1(
      '20000000-0000-4000-8000-000000000103'
    ) snapshots
  ),
  array['20000000-0000-4000-8000-000000000104']::text[],
  'discoverable lifecycle list excludes the requesting PlayerId'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.list_discoverable_player_lifecycle_v1(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.list_discoverable_player_lifecycle_v1(uuid)',
    'EXECUTE'
  ),
  'discoverable lifecycle enumeration is service-only'
);

select * from finish();

rollback;
