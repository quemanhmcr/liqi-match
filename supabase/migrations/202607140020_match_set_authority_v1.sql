-- Match Set Authority v1: immutable discovery snapshots plus idempotent invite
-- and join-request commands. Membership acceptance and Match creation remain
-- separate authoritative transitions.

create type public.match_set_state_v1 as enum ('open', 'full', 'closed');
create type public.match_set_member_role_v1 as enum ('owner', 'member');
create type public.set_invite_state_v1 as enum (
  'pending', 'accepted', 'rejected', 'expired'
);
create type public.set_join_request_state_v1 as enum (
  'pending', 'accepted', 'rejected', 'cancelled'
);

create table public.match_sets_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_player_id uuid not null references public.players(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  capacity integer not null check (capacity between 2 and 5),
  intent_kind public.home_match_kind_v1 not null default 'normal',
  state public.match_set_state_v1 not null default 'open',
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.match_set_members_v1 (
  set_id uuid not null references public.match_sets_v1(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  role public.match_set_member_role_v1 not null,
  joined_at timestamptz not null default now(),
  primary key (set_id, player_id)
);

create unique index match_set_owner_member_v1_key
  on public.match_set_members_v1 (set_id)
  where role = 'owner';

create table public.match_set_invites_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  set_id uuid not null references public.match_sets_v1(id) on delete cascade,
  actor_player_id uuid not null references public.players(id) on delete restrict,
  target_player_id uuid not null references public.players(id) on delete restrict,
  state public.set_invite_state_v1 not null default 'pending',
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (actor_player_id <> target_player_id)
);

create unique index match_set_invites_pending_target_v1_key
  on public.match_set_invites_v1 (set_id, target_player_id)
  where state = 'pending';

create table public.match_set_join_requests_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  set_id uuid not null references public.match_sets_v1(id) on delete cascade,
  requester_player_id uuid not null references public.players(id) on delete restrict,
  state public.set_join_request_state_v1 not null default 'pending',
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index match_set_join_requests_pending_player_v1_key
  on public.match_set_join_requests_v1 (set_id, requester_player_id)
  where state = 'pending';

create table private.set_discovery_snapshots_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  viewer_player_id uuid not null references public.players(id) on delete cascade,
  match_intent_id uuid not null references public.match_intents_v1(id) on delete cascade,
  intent_version bigint not null check (intent_version > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  total_candidates integer not null default 0 check (total_candidates >= 0),
  check (expires_at > created_at)
);

create table private.set_discovery_snapshot_candidates_v1 (
  snapshot_id uuid not null references private.set_discovery_snapshots_v1(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  set_id uuid not null references public.match_sets_v1(id) on delete cascade,
  payload jsonb not null,
  primary key (snapshot_id, ordinal),
  unique (snapshot_id, set_id)
);

create table private.set_discovery_cursors_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  snapshot_id uuid not null references private.set_discovery_snapshots_v1(id) on delete cascade,
  next_ordinal integer not null check (next_ordinal > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (snapshot_id, next_ordinal)
);

create index match_sets_state_created_v1_idx
  on public.match_sets_v1 (state, created_at desc);
create index match_set_members_player_v1_idx
  on public.match_set_members_v1 (player_id, set_id);
create index set_discovery_snapshots_viewer_v1_idx
  on private.set_discovery_snapshots_v1 (viewer_player_id, created_at desc);
create index set_discovery_cursors_expiry_v1_idx
  on private.set_discovery_cursors_v1 (expires_at);

create trigger match_sets_v1_set_updated_at
before update on public.match_sets_v1
for each row execute function public.set_updated_at();
create trigger match_set_invites_v1_set_updated_at
before update on public.match_set_invites_v1
for each row execute function public.set_updated_at();
create trigger match_set_join_requests_v1_set_updated_at
before update on public.match_set_join_requests_v1
for each row execute function public.set_updated_at();

create or replace function private.match_set_snapshot_v1(p_set_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'capacity', sets.capacity,
    'createdAt', sets.created_at,
    'intentKind', sets.intent_kind,
    'memberPlayerIds', coalesce(
      (
        select jsonb_agg(members.player_id order by members.player_id)
        from public.match_set_members_v1 members
        where members.set_id = sets.id
      ),
      '[]'::jsonb
    ),
    'ownerPlayerId', sets.owner_player_id,
    'setId', sets.id,
    'state', sets.state,
    'title', sets.title,
    'version', sets.version
  )
  from public.match_sets_v1 sets
  where sets.id = p_set_id
$$;

create or replace function private.assert_active_match_intent_v1(
  p_player_id uuid
)
returns public.match_intents_v1
language plpgsql
security definer
set search_path = ''
as $$
declare
  intent public.match_intents_v1%rowtype;
begin
  perform private.expire_match_intent_v1(p_player_id);
  select * into intent
  from public.match_intents_v1 intents
  where intents.player_id = p_player_id;

  if intent.id is null or intent.state <> 'active' then
    perform private.raise_core_error_v1(
      'intent_not_active',
      'An active Match Intent is required.'
    );
  end if;
  return intent;
end;
$$;

create or replace function private.assert_match_set_open_v1(
  p_set public.match_sets_v1
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_count integer;
begin
  select count(*)::integer into member_count
  from public.match_set_members_v1 members
  where members.set_id = p_set.id;

  if p_set.state = 'closed' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'The Match Set is closed.'
    );
  end if;
  if p_set.state = 'full' or member_count >= p_set.capacity then
    perform private.raise_core_error_v1(
      'validation_failed',
      'The Match Set is full.'
    );
  end if;
end;
$$;

create or replace function private.create_set_discovery_snapshot_v1(
  p_viewer_player_id uuid,
  p_viewer_legacy_profile_id uuid,
  p_match_intent public.match_intents_v1
)
returns private.set_discovery_snapshots_v1
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_row private.set_discovery_snapshots_v1%rowtype;
  candidate_count integer;
begin
  insert into private.set_discovery_snapshots_v1 (
    viewer_player_id,
    match_intent_id,
    intent_version,
    expires_at
  ) values (
    p_viewer_player_id,
    p_match_intent.id,
    p_match_intent.version,
    now() + interval '10 minutes'
  )
  returning * into snapshot_row;

  with candidates as (
    select
      sets.id,
      sets.created_at,
      sets.intent_kind,
      sets.capacity - count(members.player_id)::integer as open_slots,
      case
        when sets.intent_kind::text = p_match_intent.filters ->> 'intentKind'
        then 1 else 0
      end as intent_overlap,
      exists (
        select 1
        from public.match_set_join_requests_v1 requests
        where requests.set_id = sets.id
          and requests.requester_player_id = p_viewer_player_id
          and requests.state = 'pending'
      ) as has_pending_request,
      exists (
        select 1
        from public.match_set_invites_v1 invites
        where invites.set_id = sets.id
          and invites.target_player_id = p_viewer_player_id
          and invites.state = 'pending'
      ) as has_pending_invite
    from public.match_sets_v1 sets
    join public.match_set_members_v1 members on members.set_id = sets.id
    join public.player_profiles_v1 owner_profile
      on owner_profile.player_id = sets.owner_player_id
    where sets.state = 'open'
      and private.is_player_discovery_eligible_v1(sets.owner_player_id)
      and private.is_match_intent_lifecycle_projection_ready_v1(
        sets.owner_player_id,
        (
          select players.lifecycle_version
          from public.players players
          where players.id = sets.owner_player_id
        )
      )
      and not exists (
        select 1
        from public.match_set_members_v1 viewer_membership
        where viewer_membership.set_id = sets.id
          and viewer_membership.player_id = p_viewer_player_id
      )
      and not private.are_profiles_blocked(
        p_viewer_legacy_profile_id,
        owner_profile.legacy_profile_id
      )
    group by sets.id
    having count(members.player_id) < sets.capacity
  ), ranked as (
    select
      row_number() over (
        order by intent_overlap desc, open_slots desc, created_at desc, id
      )::integer as ordinal,
      candidates.*
    from candidates
  )
  insert into private.set_discovery_snapshot_candidates_v1 (
    snapshot_id,
    ordinal,
    set_id,
    payload
  )
  select
    snapshot_row.id,
    ranked.ordinal,
    ranked.id,
    jsonb_build_object(
      'capabilities', jsonb_build_object(
        'canInvite', false,
        'canRequestJoin', not ranked.has_pending_request
          and not ranked.has_pending_invite
      ),
      'recommendationContext', jsonb_build_object(
        'reasonCodes', to_jsonb(array_remove(array[
          'open_slot'::text,
          case when ranked.intent_overlap = 1 then 'intent_kind_overlap' end,
          case when ranked.has_pending_request then 'join_request_pending' end,
          case when ranked.has_pending_invite then 'invite_pending' end
        ], null))
      ),
      'set', private.match_set_snapshot_v1(ranked.id)
    )
  from ranked;

  get diagnostics candidate_count = row_count;
  update private.set_discovery_snapshots_v1
  set total_candidates = candidate_count
  where id = snapshot_row.id
  returning * into snapshot_row;
  return snapshot_row;
end;
$$;

create or replace function public.list_discovery_sets_v1(
  p_cursor uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_identity jsonb;
  actor_lifecycle jsonb;
  actor_player_id uuid;
  actor_profile public.player_profiles_v1%rowtype;
  actor_intent public.match_intents_v1%rowtype;
  snapshot_row private.set_discovery_snapshots_v1%rowtype;
  cursor_row private.set_discovery_cursors_v1%rowtype;
  start_ordinal integer := 1;
  next_ordinal_value integer;
  next_cursor_id uuid;
  page_items jsonb;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1('unauthenticated', 'Authentication is required.');
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Set discovery page limit must be between 1 and 50.'
    );
  end if;
  if not private.discovery_reads_enabled_v1() then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Authoritative Discovery reads are disabled by rollout policy.',
      true
    );
  end if;

  actor_identity := public.resolve_player_identity_v1(actor_account_id, false);
  if actor_identity is null then
    perform private.raise_core_error_v1('player_not_found', 'Player identity was not found.');
  end if;
  actor_player_id := (actor_identity ->> 'playerId')::uuid;
  actor_lifecycle := public.get_player_lifecycle_snapshot_v1(actor_player_id, false);
  perform private.assert_discovery_eligible_v1(actor_lifecycle);
  actor_intent := private.assert_active_match_intent_v1(actor_player_id);

  select * into actor_profile
  from public.player_profiles_v1 profiles
  where profiles.id = (actor_identity ->> 'profileId')::uuid;
  if actor_profile.legacy_profile_id is null then
    perform private.raise_core_error_v1('profile_incomplete', 'Profile mapping is incomplete.');
  end if;

  if p_cursor is null then
    snapshot_row := private.create_set_discovery_snapshot_v1(
      actor_player_id,
      actor_profile.legacy_profile_id,
      actor_intent
    );
  else
    select * into cursor_row
    from private.set_discovery_cursors_v1 cursors
    where cursors.id = p_cursor;
    if cursor_row.id is null or cursor_row.expires_at <= now() then
      perform private.raise_core_error_v1('stale_cursor', 'Set discovery cursor is invalid or expired.');
    end if;
    select * into snapshot_row
    from private.set_discovery_snapshots_v1 snapshots
    where snapshots.id = cursor_row.snapshot_id;
    if snapshot_row.id is null
      or snapshot_row.viewer_player_id <> actor_player_id
      or snapshot_row.expires_at <= now()
      or snapshot_row.match_intent_id <> actor_intent.id
      or snapshot_row.intent_version <> actor_intent.version
    then
      perform private.raise_core_error_v1('stale_cursor', 'Set discovery cursor is stale.');
    end if;
    start_ordinal := cursor_row.next_ordinal;
  end if;

  select coalesce(jsonb_agg(page.payload order by page.ordinal), '[]'::jsonb)
  into page_items
  from (
    select candidates.ordinal, candidates.payload
    from private.set_discovery_snapshot_candidates_v1 candidates
    where candidates.snapshot_id = snapshot_row.id
      and candidates.ordinal >= start_ordinal
      and candidates.ordinal < start_ordinal + p_limit
    order by candidates.ordinal
  ) page;

  next_ordinal_value := start_ordinal + p_limit;
  if next_ordinal_value <= snapshot_row.total_candidates then
    insert into private.set_discovery_cursors_v1 (
      snapshot_id, next_ordinal, expires_at
    ) values (
      snapshot_row.id, next_ordinal_value, snapshot_row.expires_at
    )
    on conflict (snapshot_id, next_ordinal) do update
      set expires_at = excluded.expires_at
    returning id into next_cursor_id;
  end if;

  return jsonb_build_object(
    'items', page_items,
    'nextCursor', next_cursor_id,
    'snapshot', jsonb_build_object(
      'createdAt', snapshot_row.created_at,
      'expiresAt', snapshot_row.expires_at,
      'intentVersion', snapshot_row.intent_version,
      'snapshotId', snapshot_row.id
    )
  );
end;
$$;

create or replace function public.create_set_invite_v1(
  p_set_id uuid,
  p_target_player_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_expected_set_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_identity jsonb;
  actor_player_id uuid;
  low_player_id uuid;
  high_player_id uuid;
  low_lifecycle jsonb;
  high_lifecycle jsonb;
  actor_lifecycle jsonb;
  target_lifecycle jsonb;
  actor_profile public.player_profiles_v1%rowtype;
  target_profile public.player_profiles_v1%rowtype;
  set_row public.match_sets_v1%rowtype;
  invite public.match_set_invites_v1%rowtype;
  request_hash text;
  command_state record;
  response_payload jsonb;
  event_id uuid;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1('unauthenticated', 'Authentication is required.');
  end if;
  if p_set_id is null or p_target_player_id is null or p_correlation_id is null
    or p_expected_set_version is null
  then
    perform private.raise_core_error_v1('validation_failed', 'Set invite command is incomplete.');
  end if;

  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id,
    'targetPlayerId', p_target_player_id,
    'correlationId', p_correlation_id,
    'expectedSetVersion', p_expected_set_version
  ));
  select * into command_state
  from private.begin_command_v1(
    'create_set_invite_v1', actor_account_id, p_idempotency_key, request_hash
  );
  if command_state.repeated then return command_state.response; end if;
  if not private.match_decision_writes_enabled_v1() then
    perform private.raise_core_error_v1('service_unavailable', 'Set writes are disabled.', true);
  end if;

  actor_identity := public.resolve_player_identity_v1(actor_account_id, false);
  if actor_identity is null then
    perform private.raise_core_error_v1('player_not_found', 'Actor identity was not found.');
  end if;
  actor_player_id := (actor_identity ->> 'playerId')::uuid;
  if actor_player_id = p_target_player_id then
    perform private.raise_core_error_v1('validation_failed', 'Cannot invite yourself.');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('match_set:' || p_set_id::text, 0)
  );
  select * into set_row from public.match_sets_v1 where id = p_set_id for update;
  if set_row.id is null then
    perform private.raise_core_error_v1('not_found', 'Match Set was not found.');
  end if;
  if set_row.owner_player_id <> actor_player_id then
    perform private.raise_core_error_v1('validation_failed', 'Only the Set owner can invite.');
  end if;
  if set_row.version <> p_expected_set_version then
    perform private.raise_core_error_v1('validation_failed', 'Match Set version changed.');
  end if;
  perform private.assert_match_set_open_v1(set_row);

  low_player_id := least(actor_player_id, p_target_player_id);
  high_player_id := greatest(actor_player_id, p_target_player_id);
  low_lifecycle := public.get_player_lifecycle_snapshot_v1(low_player_id, true);
  high_lifecycle := public.get_player_lifecycle_snapshot_v1(high_player_id, true);
  if actor_player_id = low_player_id then
    actor_lifecycle := low_lifecycle; target_lifecycle := high_lifecycle;
  else
    actor_lifecycle := high_lifecycle; target_lifecycle := low_lifecycle;
  end if;
  perform private.assert_discovery_eligible_v1(actor_lifecycle);
  perform private.assert_discovery_eligible_v1(target_lifecycle);
  perform private.assert_active_match_intent_v1(actor_player_id);

  if exists (
    select 1 from public.match_set_members_v1 members
    where members.set_id = p_set_id and members.player_id = p_target_player_id
  ) then
    perform private.raise_core_error_v1('validation_failed', 'Target is already a Set member.');
  end if;

  select * into actor_profile from public.player_profiles_v1
  where id = (actor_lifecycle ->> 'profileId')::uuid;
  select * into target_profile from public.player_profiles_v1
  where id = (target_lifecycle ->> 'profileId')::uuid;
  if private.are_profiles_blocked(
    actor_profile.legacy_profile_id, target_profile.legacy_profile_id
  ) then
    perform private.raise_core_error_v1('validation_failed', 'Relationship is blocked.');
  end if;

  select * into invite
  from public.match_set_invites_v1 invites
  where invites.set_id = p_set_id
    and invites.target_player_id = p_target_player_id
    and invites.state = 'pending'
  for update;
  if invite.id is not null then
    response_payload := jsonb_build_object(
      'inviteId', invite.id, 'state', 'pending', 'repeated', true
    );
    perform private.finish_command_v1(
      'create_set_invite_v1', actor_account_id, p_idempotency_key, response_payload
    );
    return response_payload;
  end if;

  insert into public.match_set_invites_v1 (
    set_id, actor_player_id, target_player_id, correlation_id
  ) values (
    p_set_id, actor_player_id, p_target_player_id, p_correlation_id
  ) returning * into invite;

  event_id := private.enqueue_contract_event_v1(
    'set.invite_created.v1', 'set_invite', invite.id, p_correlation_id, null,
    jsonb_build_object(
      'actorPlayerId', actor_player_id,
      'inviteId', invite.id,
      'setId', p_set_id,
      'targetPlayerId', p_target_player_id
    ),
    format('set.invite_created.v1:%s', invite.id)
  );
  perform private.enqueue_contract_event_v1(
    'notification.requested.v1', 'player', p_target_player_id,
    p_correlation_id, event_id,
    jsonb_build_object(
      'recipientPlayerId', p_target_player_id,
      'reasonCode', 'set_invite_created',
      'target', jsonb_build_object(
        'kind', 'set_invite', 'setId', p_set_id, 'inviteId', invite.id
      )
    ),
    format('notification.requested.v1:set_invite:%s', invite.id)
  );

  response_payload := jsonb_build_object(
    'inviteId', invite.id, 'state', 'pending', 'repeated', false
  );
  perform private.finish_command_v1(
    'create_set_invite_v1', actor_account_id, p_idempotency_key, response_payload
  );
  return response_payload;
end;
$$;

create or replace function public.request_set_join_v1(
  p_set_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_expected_set_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_identity jsonb;
  actor_lifecycle jsonb;
  actor_player_id uuid;
  actor_profile public.player_profiles_v1%rowtype;
  owner_profile public.player_profiles_v1%rowtype;
  set_row public.match_sets_v1%rowtype;
  join_request public.match_set_join_requests_v1%rowtype;
  request_hash text;
  command_state record;
  response_payload jsonb;
  event_id uuid;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1('unauthenticated', 'Authentication is required.');
  end if;
  if p_set_id is null or p_correlation_id is null or p_expected_set_version is null then
    perform private.raise_core_error_v1('validation_failed', 'Set join command is incomplete.');
  end if;

  request_hash := private.command_request_hash_v1(jsonb_build_object(
    'setId', p_set_id,
    'correlationId', p_correlation_id,
    'expectedSetVersion', p_expected_set_version
  ));
  select * into command_state
  from private.begin_command_v1(
    'request_set_join_v1', actor_account_id, p_idempotency_key, request_hash
  );
  if command_state.repeated then return command_state.response; end if;
  if not private.match_decision_writes_enabled_v1() then
    perform private.raise_core_error_v1('service_unavailable', 'Set writes are disabled.', true);
  end if;

  actor_identity := public.resolve_player_identity_v1(actor_account_id, false);
  if actor_identity is null then
    perform private.raise_core_error_v1('player_not_found', 'Actor identity was not found.');
  end if;
  actor_player_id := (actor_identity ->> 'playerId')::uuid;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('match_set:' || p_set_id::text, 0)
  );
  select * into set_row from public.match_sets_v1 where id = p_set_id for update;
  if set_row.id is null then
    perform private.raise_core_error_v1('not_found', 'Match Set was not found.');
  end if;
  if set_row.version <> p_expected_set_version then
    perform private.raise_core_error_v1('validation_failed', 'Match Set version changed.');
  end if;
  perform private.assert_match_set_open_v1(set_row);

  actor_lifecycle := public.get_player_lifecycle_snapshot_v1(actor_player_id, true);
  perform private.assert_discovery_eligible_v1(actor_lifecycle);
  perform private.assert_active_match_intent_v1(actor_player_id);
  if exists (
    select 1 from public.match_set_members_v1 members
    where members.set_id = p_set_id and members.player_id = actor_player_id
  ) then
    perform private.raise_core_error_v1('validation_failed', 'Player is already a Set member.');
  end if;

  select * into actor_profile from public.player_profiles_v1
  where id = (actor_lifecycle ->> 'profileId')::uuid;
  select * into owner_profile from public.player_profiles_v1
  where player_id = set_row.owner_player_id;
  if private.are_profiles_blocked(
    actor_profile.legacy_profile_id, owner_profile.legacy_profile_id
  ) then
    perform private.raise_core_error_v1('validation_failed', 'Relationship is blocked.');
  end if;

  select * into join_request
  from public.match_set_join_requests_v1 requests
  where requests.set_id = p_set_id
    and requests.requester_player_id = actor_player_id
    and requests.state = 'pending'
  for update;
  if join_request.id is not null then
    response_payload := jsonb_build_object(
      'joinRequestId', join_request.id, 'state', 'pending', 'repeated', true
    );
    perform private.finish_command_v1(
      'request_set_join_v1', actor_account_id, p_idempotency_key, response_payload
    );
    return response_payload;
  end if;

  insert into public.match_set_join_requests_v1 (
    set_id, requester_player_id, correlation_id
  ) values (
    p_set_id, actor_player_id, p_correlation_id
  ) returning * into join_request;

  event_id := private.enqueue_contract_event_v1(
    'set.join_requested.v1', 'set_join_request', join_request.id,
    p_correlation_id, null,
    jsonb_build_object(
      'joinRequestId', join_request.id,
      'requesterPlayerId', actor_player_id,
      'setId', p_set_id
    ),
    format('set.join_requested.v1:%s', join_request.id)
  );
  perform private.enqueue_contract_event_v1(
    'notification.requested.v1', 'player', set_row.owner_player_id,
    p_correlation_id, event_id,
    jsonb_build_object(
      'recipientPlayerId', set_row.owner_player_id,
      'reasonCode', 'set_join_requested',
      'target', jsonb_build_object(
        'kind', 'set_join_request',
        'setId', p_set_id,
        'joinRequestId', join_request.id
      )
    ),
    format('notification.requested.v1:set_join:%s', join_request.id)
  );

  response_payload := jsonb_build_object(
    'joinRequestId', join_request.id, 'state', 'pending', 'repeated', false
  );
  perform private.finish_command_v1(
    'request_set_join_v1', actor_account_id, p_idempotency_key, response_payload
  );
  return response_payload;
end;
$$;

alter table public.match_sets_v1 enable row level security;
alter table public.match_set_members_v1 enable row level security;
alter table public.match_set_invites_v1 enable row level security;
alter table public.match_set_join_requests_v1 enable row level security;

revoke all on table public.match_sets_v1 from public, anon, authenticated;
revoke all on table public.match_set_members_v1 from public, anon, authenticated;
revoke all on table public.match_set_invites_v1 from public, anon, authenticated;
revoke all on table public.match_set_join_requests_v1 from public, anon, authenticated;
revoke all on table private.set_discovery_snapshots_v1 from public, anon, authenticated;
revoke all on table private.set_discovery_snapshot_candidates_v1 from public, anon, authenticated;
revoke all on table private.set_discovery_cursors_v1 from public, anon, authenticated;
grant all on table private.set_discovery_snapshots_v1 to service_role;
grant all on table private.set_discovery_snapshot_candidates_v1 to service_role;
grant all on table private.set_discovery_cursors_v1 to service_role;

revoke execute on function private.match_set_snapshot_v1(uuid) from public, anon, authenticated;
revoke execute on function private.assert_active_match_intent_v1(uuid) from public, anon, authenticated;
revoke execute on function private.assert_match_set_open_v1(public.match_sets_v1) from public, anon, authenticated;
revoke execute on function private.create_set_discovery_snapshot_v1(uuid, uuid, public.match_intents_v1) from public, anon, authenticated;
revoke execute on function public.list_discovery_sets_v1(uuid, integer) from public, anon;
revoke execute on function public.create_set_invite_v1(uuid, uuid, text, uuid, bigint) from public, anon;
revoke execute on function public.request_set_join_v1(uuid, text, uuid, bigint) from public, anon;
grant execute on function public.list_discovery_sets_v1(uuid, integer) to authenticated;
grant execute on function public.create_set_invite_v1(uuid, uuid, text, uuid, bigint) to authenticated;
grant execute on function public.request_set_join_v1(uuid, text, uuid, bigint) to authenticated;
