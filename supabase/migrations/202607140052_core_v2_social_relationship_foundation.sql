-- Core V2 Social Relationship & Safety foundation.
-- Canonical identity remains Core V1 PlayerId. Legacy profile blocks are read only
-- as a temporary shadow source during the additive cutover.

create type public.friendship_state_v2 as enum (
  'none',
  'pending',
  'accepted',
  'removed'
);
create type public.friendship_request_state_v2 as enum (
  'pending',
  'accepted',
  'declined',
  'cancelled',
  'expired'
);
create type public.profile_visibility_v2 as enum (
  'everyone',
  'friends',
  'private'
);
create type public.presence_visibility_v2 as enum (
  'everyone',
  'friends',
  'hidden'
);
create type public.friendship_request_policy_v2 as enum (
  'everyone',
  'matched_only',
  'nobody'
);
create type public.session_invite_policy_v2 as enum (
  'everyone',
  'friends',
  'nobody'
);
create type public.report_target_kind_v2 as enum ('player', 'message');
create type public.report_state_v2 as enum (
  'submitted',
  'under_review',
  'resolved',
  'dismissed'
);

create table public.social_relationships_v2 (
  id uuid primary key,
  player_low_id uuid not null references public.players(id) on delete restrict,
  player_high_id uuid not null references public.players(id) on delete restrict,
  friendship_state public.friendship_state_v2 not null default 'none',
  version bigint not null default 0 check (version >= 0),
  accepted_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_relationships_v2_player_pair_key unique (
    player_low_id,
    player_high_id
  ),
  constraint social_relationships_v2_ordered_pair_check check (
    player_low_id < player_high_id
  )
);

create table public.friendship_requests_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  relationship_id uuid not null references public.social_relationships_v2(id) on delete restrict,
  requester_player_id uuid not null references public.players(id) on delete restrict,
  recipient_player_id uuid not null references public.players(id) on delete restrict,
  state public.friendship_request_state_v2 not null default 'pending',
  version bigint not null default 1 check (version > 0),
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendship_requests_v2_distinct_players_check check (
    requester_player_id <> recipient_player_id
  )
);

create unique index friendship_requests_v2_one_pending_per_relationship_idx
  on public.friendship_requests_v2 (relationship_id)
  where state = 'pending';
create index friendship_requests_v2_recipient_state_idx
  on public.friendship_requests_v2 (recipient_player_id, state, created_at desc);
create index friendship_requests_v2_requester_state_idx
  on public.friendship_requests_v2 (requester_player_id, state, created_at desc);

create table public.player_blocks_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  relationship_id uuid not null references public.social_relationships_v2(id) on delete restrict,
  blocker_player_id uuid not null references public.players(id) on delete restrict,
  blocked_player_id uuid not null references public.players(id) on delete restrict,
  active boolean not null default true,
  version bigint not null default 1 check (version > 0),
  reason_code text,
  blocked_at timestamptz not null default now(),
  unblocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_blocks_v2_direction_key unique (
    blocker_player_id,
    blocked_player_id
  ),
  constraint player_blocks_v2_distinct_players_check check (
    blocker_player_id <> blocked_player_id
  ),
  constraint player_blocks_v2_active_time_check check (
    (active and unblocked_at is null)
    or (not active and unblocked_at is not null)
  )
);
create index player_blocks_v2_blocked_active_idx
  on public.player_blocks_v2 (blocked_player_id, blocker_player_id)
  where active;

create table public.player_mutes_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  relationship_id uuid not null references public.social_relationships_v2(id) on delete restrict,
  muter_player_id uuid not null references public.players(id) on delete restrict,
  muted_player_id uuid not null references public.players(id) on delete restrict,
  active boolean not null default true,
  version bigint not null default 1 check (version > 0),
  muted_at timestamptz not null default now(),
  unmuted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_mutes_v2_direction_key unique (
    muter_player_id,
    muted_player_id
  ),
  constraint player_mutes_v2_distinct_players_check check (
    muter_player_id <> muted_player_id
  ),
  constraint player_mutes_v2_active_time_check check (
    (active and unmuted_at is null)
    or (not active and unmuted_at is not null)
  )
);

create table public.player_privacy_settings_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  player_id uuid not null unique references public.players(id) on delete restrict,
  version bigint not null default 1 check (version > 0),
  profile_visibility public.profile_visibility_v2 not null default 'everyone',
  presence_visibility public.presence_visibility_v2 not null default 'friends',
  friendship_requests public.friendship_request_policy_v2 not null default 'everyone',
  session_invites public.session_invite_policy_v2 not null default 'friends',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reports_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  reporter_player_id uuid not null references public.players(id) on delete restrict,
  target_player_id uuid not null references public.players(id) on delete restrict,
  target_kind public.report_target_kind_v2 not null,
  category text not null check (category in (
    'harassment',
    'hate',
    'spam',
    'sexual_content',
    'threat',
    'cheating',
    'other'
  )),
  details text,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  state public.report_state_v2 not null default 'submitted',
  version bigint not null default 1 check (version > 0),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_v2_distinct_players_check check (
    reporter_player_id <> target_player_id
  ),
  constraint reports_v2_target_shape_check check (
    (target_kind = 'player' and conversation_id is null and message_id is null)
    or (target_kind = 'message' and conversation_id is not null and message_id is not null)
  )
);
create index reports_v2_target_state_idx
  on public.reports_v2 (target_player_id, state, created_at desc);

create table public.report_evidence_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  report_id uuid not null references public.reports_v2(id) on delete restrict,
  evidence_kind text not null check (evidence_kind in (
    'message_reference',
    'media_reference',
    'client_context'
  )),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table private.social_authority_config_v2 (
  singleton boolean primary key default true check (singleton),
  reads_enabled boolean not null default true,
  writes_enabled boolean not null default false,
  legacy_block_shadow_reads_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into private.social_authority_config_v2 (singleton) values (true);

create table private.social_authority_metrics_v2 (
  id bigint generated always as identity primary key,
  metric_name text not null,
  relationship_id uuid,
  actor_player_id uuid,
  target_player_id uuid,
  value integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index social_authority_metrics_v2_name_time_idx
  on private.social_authority_metrics_v2 (metric_name, occurred_at desc);

alter table public.social_relationships_v2 enable row level security;
alter table public.friendship_requests_v2 enable row level security;
alter table public.player_blocks_v2 enable row level security;
alter table public.player_mutes_v2 enable row level security;
alter table public.player_privacy_settings_v2 enable row level security;
alter table public.reports_v2 enable row level security;
alter table public.report_evidence_v2 enable row level security;

revoke all on public.social_relationships_v2 from public, anon, authenticated;
revoke all on public.friendship_requests_v2 from public, anon, authenticated;
revoke all on public.player_blocks_v2 from public, anon, authenticated;
revoke all on public.player_mutes_v2 from public, anon, authenticated;
revoke all on public.player_privacy_settings_v2 from public, anon, authenticated;
revoke all on public.reports_v2 from public, anon, authenticated;
revoke all on public.report_evidence_v2 from public, anon, authenticated;
revoke all on private.social_authority_config_v2 from public, anon, authenticated;
revoke all on private.social_authority_metrics_v2 from public, anon, authenticated;

grant all on public.social_relationships_v2 to service_role;
grant all on public.friendship_requests_v2 to service_role;
grant all on public.player_blocks_v2 to service_role;
grant all on public.player_mutes_v2 to service_role;
grant all on public.player_privacy_settings_v2 to service_role;
grant all on public.reports_v2 to service_role;
grant all on public.report_evidence_v2 to service_role;
grant all on private.social_authority_config_v2 to service_role;
grant all on private.social_authority_metrics_v2 to service_role;

create trigger social_relationships_v2_set_updated_at
before update on public.social_relationships_v2
for each row execute function public.set_updated_at();
create trigger friendship_requests_v2_set_updated_at
before update on public.friendship_requests_v2
for each row execute function public.set_updated_at();
create trigger player_blocks_v2_set_updated_at
before update on public.player_blocks_v2
for each row execute function public.set_updated_at();
create trigger player_mutes_v2_set_updated_at
before update on public.player_mutes_v2
for each row execute function public.set_updated_at();
create trigger player_privacy_settings_v2_set_updated_at
before update on public.player_privacy_settings_v2
for each row execute function public.set_updated_at();
create trigger reports_v2_set_updated_at
before update on public.reports_v2
for each row execute function public.set_updated_at();

create or replace function private.social_relationship_id_v2(
  p_left_player_id uuid,
  p_right_player_id uuid
)
returns uuid
language sql
immutable
set search_path = ''
as $$
  with ordered as (
    select
      least(p_left_player_id, p_right_player_id)::text as low_id,
      greatest(p_left_player_id, p_right_player_id)::text as high_id
  ), digest as (
    select md5(low_id || ':' || high_id) as value
    from ordered
  )
  select (
    substr(value, 1, 8) || '-' ||
    substr(value, 9, 4) || '-' ||
    '4' || substr(value, 14, 3) || '-' ||
    '8' || substr(value, 18, 3) || '-' ||
    substr(value, 21, 12)
  )::uuid
  from digest;
$$;

create or replace function private.resolve_social_actor_v2(
  p_require_active boolean default true,
  p_lock boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  identity_mapping jsonb;
  lifecycle_snapshot jsonb;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1(
      'relationship_unauthenticated',
      'Authentication is required.'
    );
  end if;

  identity_mapping := public.resolve_player_identity_v1(actor_account_id, p_lock);
  if identity_mapping is null then
    perform private.raise_core_error_v1(
      'relationship_identity_mismatch',
      'The authenticated account has no canonical PlayerId mapping.'
    );
  end if;

  lifecycle_snapshot := public.get_player_lifecycle_snapshot_v1(
    (identity_mapping ->> 'playerId')::uuid,
    p_lock
  );
  if lifecycle_snapshot is null then
    perform private.raise_core_error_v1(
      'relationship_player_not_found',
      'The authenticated player does not exist.'
    );
  end if;

  if p_require_active and lifecycle_snapshot ->> 'state' <> 'active' then
    perform private.raise_core_error_v1(
      'relationship_player_not_active',
      'The authenticated player lifecycle must be active.',
      false,
      jsonb_build_object('state', lifecycle_snapshot ->> 'state')
    );
  end if;

  return identity_mapping || jsonb_build_object('lifecycle', lifecycle_snapshot);
end;
$$;

create or replace function private.assert_social_target_v2(
  p_target_player_id uuid,
  p_require_active boolean default true,
  p_lock boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  lifecycle_snapshot jsonb;
begin
  if p_target_player_id is null then
    perform private.raise_core_error_v1(
      'relationship_player_not_found',
      'The target PlayerId is required.'
    );
  end if;

  lifecycle_snapshot := public.get_player_lifecycle_snapshot_v1(
    p_target_player_id,
    p_lock
  );
  if lifecycle_snapshot is null then
    perform private.raise_core_error_v1(
      'relationship_player_not_found',
      'The target player does not exist.'
    );
  end if;

  if p_require_active and lifecycle_snapshot ->> 'state' <> 'active' then
    perform private.raise_core_error_v1(
      'relationship_player_not_active',
      'The target player lifecycle must be active.',
      false,
      jsonb_build_object('state', lifecycle_snapshot ->> 'state')
    );
  end if;

  return lifecycle_snapshot;
end;
$$;

create or replace function private.ensure_social_relationship_v2(
  p_left_player_id uuid,
  p_right_player_id uuid
)
returns public.social_relationships_v2
language plpgsql
security definer
set search_path = ''
as $$
declare
  relationship_row public.social_relationships_v2;
  relationship_id_value uuid;
  low_player_id uuid;
  high_player_id uuid;
begin
  if p_left_player_id is null or p_right_player_id is null then
    perform private.raise_core_error_v1(
      'relationship_player_not_found',
      'Both canonical PlayerIds are required.'
    );
  end if;
  if p_left_player_id = p_right_player_id then
    perform private.raise_core_error_v1(
      'relationship_self_forbidden',
      'A player cannot create a social relationship with self.'
    );
  end if;

  low_player_id := least(p_left_player_id, p_right_player_id);
  high_player_id := greatest(p_left_player_id, p_right_player_id);
  relationship_id_value := private.social_relationship_id_v2(
    low_player_id,
    high_player_id
  );

  insert into public.social_relationships_v2 (
    id,
    player_low_id,
    player_high_id
  ) values (
    relationship_id_value,
    low_player_id,
    high_player_id
  )
  on conflict (player_low_id, player_high_id) do nothing;

  select relationships.*
  into relationship_row
  from public.social_relationships_v2 relationships
  where relationships.player_low_id = low_player_id
    and relationships.player_high_id = high_player_id
  for update;

  return relationship_row;
end;
$$;

create or replace function private.are_players_blocked_v2(
  p_left_player_id uuid,
  p_right_player_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shadow_legacy boolean;
  left_legacy_profile_id uuid;
  right_legacy_profile_id uuid;
begin
  if p_left_player_id is null or p_right_player_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.player_blocks_v2 blocks
    where blocks.active
      and (
        (blocks.blocker_player_id = p_left_player_id and blocks.blocked_player_id = p_right_player_id)
        or (blocks.blocker_player_id = p_right_player_id and blocks.blocked_player_id = p_left_player_id)
      )
  ) then
    return true;
  end if;

  select config.legacy_block_shadow_reads_enabled
  into shadow_legacy
  from private.social_authority_config_v2 config
  where config.singleton;

  if not coalesce(shadow_legacy, false) then
    return false;
  end if;

  select profiles.legacy_profile_id
  into left_legacy_profile_id
  from public.player_profiles_v1 profiles
  where profiles.player_id = p_left_player_id;
  select profiles.legacy_profile_id
  into right_legacy_profile_id
  from public.player_profiles_v1 profiles
  where profiles.player_id = p_right_player_id;

  if left_legacy_profile_id is null or right_legacy_profile_id is null then
    return false;
  end if;

  return private.are_profiles_blocked(
    left_legacy_profile_id,
    right_legacy_profile_id
  );
end;
$$;

create or replace function private.social_relationship_snapshot_v2(
  p_viewer_player_id uuid,
  p_target_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  relationship_row public.social_relationships_v2;
  request_row public.friendship_requests_v2;
  privacy_row public.player_privacy_settings_v2;
  viewer_player public.players;
  target_player public.players;
  relationship_id_value uuid;
  viewer_blocks_target boolean := false;
  target_blocks_viewer boolean := false;
  viewer_muted_target boolean := false;
  blocked boolean := false;
  friend boolean := false;
  active_match boolean := false;
  friendship_label text := 'none';
  friendship_state_value text := 'none';
  profile_visibility_value text := 'everyone';
  presence_visibility_value text := 'friends';
  friendship_requests_value text := 'everyone';
  session_invites_value text := 'friends';
  can_view_profile boolean := false;
  can_discover boolean := false;
  can_message boolean := false;
  can_invite boolean := false;
  can_view_presence boolean := false;
  can_request_friendship boolean := false;
begin
  if p_viewer_player_id is null or p_target_player_id is null then
    perform private.raise_core_error_v1(
      'relationship_player_not_found',
      'Both canonical PlayerIds are required.'
    );
  end if;
  if p_viewer_player_id = p_target_player_id then
    perform private.raise_core_error_v1(
      'relationship_self_forbidden',
      'A player cannot query a social relationship with self.'
    );
  end if;

  select players.* into viewer_player
  from public.players players
  where players.id = p_viewer_player_id;
  select players.* into target_player
  from public.players players
  where players.id = p_target_player_id;
  if viewer_player.id is null or target_player.id is null then
    perform private.raise_core_error_v1(
      'relationship_player_not_found',
      'One or more players do not exist.'
    );
  end if;

  relationship_id_value := private.social_relationship_id_v2(
    p_viewer_player_id,
    p_target_player_id
  );
  select relationships.* into relationship_row
  from public.social_relationships_v2 relationships
  where relationships.id = relationship_id_value;

  select requests.* into request_row
  from public.friendship_requests_v2 requests
  where requests.relationship_id = relationship_id_value
  order by requests.created_at desc, requests.id desc
  limit 1;

  select privacy.* into privacy_row
  from public.player_privacy_settings_v2 privacy
  where privacy.player_id = p_target_player_id;

  select exists (
    select 1
    from public.player_blocks_v2 blocks
    where blocks.active
      and blocks.blocker_player_id = p_viewer_player_id
      and blocks.blocked_player_id = p_target_player_id
  ) or exists (
    select 1
    from public.blocks legacy_blocks
    join public.player_profiles_v1 blocker_profile
      on blocker_profile.legacy_profile_id = legacy_blocks.blocker_id
    join public.player_profiles_v1 blocked_profile
      on blocked_profile.legacy_profile_id = legacy_blocks.blocked_id
    join private.social_authority_config_v2 config on config.singleton
    where config.legacy_block_shadow_reads_enabled
      and blocker_profile.player_id = p_viewer_player_id
      and blocked_profile.player_id = p_target_player_id
  ) into viewer_blocks_target;

  select exists (
    select 1
    from public.player_blocks_v2 blocks
    where blocks.active
      and blocks.blocker_player_id = p_target_player_id
      and blocks.blocked_player_id = p_viewer_player_id
  ) or exists (
    select 1
    from public.blocks legacy_blocks
    join public.player_profiles_v1 blocker_profile
      on blocker_profile.legacy_profile_id = legacy_blocks.blocker_id
    join public.player_profiles_v1 blocked_profile
      on blocked_profile.legacy_profile_id = legacy_blocks.blocked_id
    join private.social_authority_config_v2 config on config.singleton
    where config.legacy_block_shadow_reads_enabled
      and blocker_profile.player_id = p_target_player_id
      and blocked_profile.player_id = p_viewer_player_id
  ) into target_blocks_viewer;

  select exists (
    select 1
    from public.player_mutes_v2 mutes
    where mutes.active
      and mutes.muter_player_id = p_viewer_player_id
      and mutes.muted_player_id = p_target_player_id
  ) into viewer_muted_target;

  select exists (
    select 1
    from public.matches matches
    where matches.unmatched_at is null
      and matches.player_low_id = least(p_viewer_player_id, p_target_player_id)
      and matches.player_high_id = greatest(p_viewer_player_id, p_target_player_id)
  ) into active_match;

  blocked := viewer_blocks_target or target_blocks_viewer;
  friend := relationship_row.friendship_state = 'accepted';
  friendship_state_value := case
    when request_row.state = 'pending' then 'pending'
    when relationship_row.friendship_state is null then 'none'
    else relationship_row.friendship_state::text
  end;
  friendship_label := case
    when friend then 'friend'
    when request_row.state = 'pending'
      and request_row.requester_player_id = p_viewer_player_id then 'pending_outgoing'
    when request_row.state = 'pending'
      and request_row.recipient_player_id = p_viewer_player_id then 'pending_incoming'
    when relationship_row.friendship_state = 'removed' then 'removed'
    else 'none'
  end;

  profile_visibility_value := coalesce(
    privacy_row.profile_visibility::text,
    'everyone'
  );
  presence_visibility_value := coalesce(
    privacy_row.presence_visibility::text,
    'friends'
  );
  friendship_requests_value := coalesce(
    privacy_row.friendship_requests::text,
    'everyone'
  );
  session_invites_value := coalesce(
    privacy_row.session_invites::text,
    'friends'
  );

  can_view_profile := not blocked
    and target_player.lifecycle_state = 'active'
    and (
      profile_visibility_value = 'everyone'
      or (profile_visibility_value = 'friends' and friend)
    );
  can_discover := can_view_profile and target_player.discoverable;
  can_message := not blocked
    and viewer_player.lifecycle_state = 'active'
    and target_player.lifecycle_state = 'active'
    and viewer_player.messaging_allowed
    and target_player.messaging_allowed
    and (friend or active_match);
  can_invite := not blocked
    and viewer_player.lifecycle_state = 'active'
    and target_player.lifecycle_state = 'active'
    and (
      session_invites_value = 'everyone'
      or (session_invites_value = 'friends' and friend)
    );
  can_view_presence := not blocked
    and target_player.lifecycle_state = 'active'
    and (
      presence_visibility_value = 'everyone'
      or (presence_visibility_value = 'friends' and friend)
    );
  can_request_friendship := not blocked
    and viewer_player.lifecycle_state = 'active'
    and target_player.lifecycle_state = 'active'
    and not friend
    and coalesce(request_row.state::text, '') <> 'pending'
    and (
      friendship_requests_value = 'everyone'
      or (friendship_requests_value = 'matched_only' and active_match)
    );

  return jsonb_build_object(
    'contractVersion', 2,
    'relationshipId', relationship_id_value,
    'viewerPlayerId', p_viewer_player_id,
    'targetPlayerId', p_target_player_id,
    'version', coalesce(relationship_row.version, 0),
    'friendship', jsonb_build_object(
      'state', friendship_state_value,
      'label', friendship_label,
      'requestId', request_row.id,
      'requestState', request_row.state,
      'requestVersion', request_row.version,
      'acceptedAt', relationship_row.accepted_at
    ),
    'block', jsonb_build_object(
      'viewerBlocksTarget', viewer_blocks_target,
      'targetBlocksViewer', target_blocks_viewer
    ),
    'mute', jsonb_build_object(
      'viewerMutedTarget', viewer_muted_target
    ),
    'targetPrivacy', jsonb_build_object(
      'contractVersion', 2,
      'playerId', p_target_player_id,
      'version', coalesce(privacy_row.version, 1),
      'profileVisibility', profile_visibility_value,
      'presenceVisibility', presence_visibility_value,
      'friendshipRequests', friendship_requests_value,
      'sessionInvites', session_invites_value,
      'updatedAt', coalesce(privacy_row.updated_at, target_player.created_at)
    ),
    'capabilities', jsonb_build_object(
      'blocked', blocked,
      'muted', viewer_muted_target,
      'friendshipLabel', friendship_label,
      'canViewProfile', can_view_profile,
      'canDiscover', can_discover,
      'canMessage', can_message,
      'canViewConversation', can_message,
      'canInviteToSession', can_invite,
      'canViewPresence', can_view_presence,
      'canRequestFriendship', can_request_friendship,
      'canAcceptFriendship', not blocked and friendship_label = 'pending_incoming',
      'canDeclineFriendship', not blocked and friendship_label = 'pending_incoming',
      'canCancelFriendship', not blocked and friendship_label = 'pending_outgoing',
      'canRemoveFriendship', not blocked and friend,
      'canBlock', not viewer_blocks_target,
      'canUnblock', viewer_blocks_target,
      'canMute', not blocked and not viewer_muted_target,
      'canUnmute', not blocked and viewer_muted_target,
      'canReport', true
    ),
    'updatedAt', coalesce(
      greatest(
        relationship_row.updated_at,
        request_row.updated_at,
        privacy_row.updated_at
      ),
      relationship_row.updated_at,
      request_row.updated_at,
      privacy_row.updated_at,
      target_player.updated_at
    )
  );
end;
$$;

create or replace function public.get_relationship_v2(
  p_target_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  config_row private.social_authority_config_v2;
  actor_context jsonb;
  actor_player_id uuid;
begin
  select config.* into config_row
  from private.social_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.reads_enabled, false) then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Core V2 social reads are disabled.',
      true
    );
  end if;

  actor_context := private.resolve_social_actor_v2(false, false);
  actor_player_id := (actor_context ->> 'playerId')::uuid;
  perform private.assert_social_target_v2(p_target_player_id, false, false);

  return private.social_relationship_snapshot_v2(
    actor_player_id,
    p_target_player_id
  );
end;
$$;

create or replace function public.list_friendships_v2(
  p_limit integer default 50,
  p_after_player_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  config_row private.social_authority_config_v2;
  actor_context jsonb;
  actor_player_id uuid;
  page_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  items jsonb;
  next_cursor uuid;
begin
  select config.* into config_row
  from private.social_authority_config_v2 config
  where config.singleton;
  if not coalesce(config_row.reads_enabled, false) then
    perform private.raise_core_error_v1(
      'service_unavailable',
      'Core V2 social reads are disabled.',
      true
    );
  end if;

  actor_context := private.resolve_social_actor_v2(false, false);
  actor_player_id := (actor_context ->> 'playerId')::uuid;

  with friendship_targets as (
    select case
      when relationships.player_low_id = actor_player_id
        then relationships.player_high_id
      else relationships.player_low_id
    end as target_player_id
    from public.social_relationships_v2 relationships
    where relationships.friendship_state = 'accepted'
      and actor_player_id in (
        relationships.player_low_id,
        relationships.player_high_id
      )
      and not private.are_players_blocked_v2(
        relationships.player_low_id,
        relationships.player_high_id
      )
  ), page as (
    select targets.target_player_id
    from friendship_targets targets
    where p_after_player_id is null
      or targets.target_player_id > p_after_player_id
    order by targets.target_player_id
    limit page_limit + 1
  ), visible_page as (
    select page.target_player_id
    from page
    order by page.target_player_id
    limit page_limit
  )
  select
    coalesce(
      jsonb_agg(
        private.social_relationship_snapshot_v2(
          actor_player_id,
          visible_page.target_player_id
        )
        order by visible_page.target_player_id
      ),
      '[]'::jsonb
    ),
    case
      when (select count(*) from page) > page_limit
        then (select max(target_player_id) from visible_page)
      else null
    end
  into items, next_cursor
  from visible_page;

  return jsonb_build_object(
    'contractVersion', 2,
    'items', items,
    'nextCursor', next_cursor
  );
end;
$$;

create or replace function private.seed_player_privacy_settings_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.player_privacy_settings_v2 (player_id)
  values (new.id)
  on conflict (player_id) do nothing;
  return new;
end;
$$;

create trigger players_seed_privacy_settings_v2
after insert on public.players
for each row execute function private.seed_player_privacy_settings_v2();

insert into public.player_privacy_settings_v2 (player_id)
select players.id
from public.players players
on conflict (player_id) do nothing;

with legacy_pairs as (
  select distinct
    blocker_profile.player_id as blocker_player_id,
    blocked_profile.player_id as blocked_player_id,
    least(blocker_profile.player_id, blocked_profile.player_id) as player_low_id,
    greatest(blocker_profile.player_id, blocked_profile.player_id) as player_high_id,
    private.social_relationship_id_v2(
      blocker_profile.player_id,
      blocked_profile.player_id
    ) as relationship_id,
    legacy_blocks.reason,
    legacy_blocks.created_at
  from public.blocks legacy_blocks
  join public.player_profiles_v1 blocker_profile
    on blocker_profile.legacy_profile_id = legacy_blocks.blocker_id
  join public.player_profiles_v1 blocked_profile
    on blocked_profile.legacy_profile_id = legacy_blocks.blocked_id
  where blocker_profile.player_id <> blocked_profile.player_id
), inserted_relationships as (
  insert into public.social_relationships_v2 (
    id,
    player_low_id,
    player_high_id,
    friendship_state,
    version,
    created_at,
    updated_at
  )
  select
    pairs.relationship_id,
    pairs.player_low_id,
    pairs.player_high_id,
    'none',
    1,
    min(pairs.created_at),
    max(pairs.created_at)
  from legacy_pairs pairs
  group by pairs.relationship_id, pairs.player_low_id, pairs.player_high_id
  on conflict (player_low_id, player_high_id) do nothing
  returning id
)
insert into public.player_blocks_v2 (
  relationship_id,
  blocker_player_id,
  blocked_player_id,
  active,
  version,
  reason_code,
  blocked_at,
  created_at,
  updated_at
)
select
  pairs.relationship_id,
  pairs.blocker_player_id,
  pairs.blocked_player_id,
  true,
  1,
  pairs.reason,
  pairs.created_at,
  pairs.created_at,
  pairs.created_at
from legacy_pairs pairs
on conflict (blocker_player_id, blocked_player_id) do nothing;

create or replace function private.enqueue_contract_event_v2(
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_aggregate_version bigint,
  p_actor_player_id uuid,
  p_correlation_id uuid,
  p_causation_id uuid,
  p_payload jsonb,
  p_deduplication_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid := extensions.gen_random_uuid();
  occurred_at_value timestamptz := now();
  persisted_event_id uuid;
begin
  if p_aggregate_version is null or p_aggregate_version <= 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Core V2 event aggregateVersion must be positive.'
    );
  end if;

  insert into private.outbox_events (
    id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    correlation_id,
    causation_id,
    deduplication_key,
    contract_version
  ) values (
    event_id_value,
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    jsonb_build_object(
      'eventId', event_id_value,
      'eventType', p_event_type,
      'eventVersion', 2,
      'aggregateType', p_aggregate_type,
      'aggregateId', p_aggregate_id,
      'aggregateVersion', p_aggregate_version,
      'actorPlayerId', p_actor_player_id,
      'correlationId', p_correlation_id,
      'causationId', p_causation_id,
      'occurredAt', occurred_at_value,
      'payload', coalesce(p_payload, '{}'::jsonb)
    ),
    p_correlation_id,
    p_causation_id,
    p_deduplication_key,
    2
  )
  on conflict (deduplication_key) do update
    set deduplication_key = excluded.deduplication_key
  returning id into persisted_event_id;

  return persisted_event_id;
end;
$$;

create index outbox_events_contract_pending_v2_idx
  on private.outbox_events (event_type, status, available_at)
  where contract_version = 2;

revoke execute on function private.social_relationship_id_v2(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.resolve_social_actor_v2(boolean, boolean)
  from public, anon, authenticated;
revoke execute on function private.assert_social_target_v2(uuid, boolean, boolean)
  from public, anon, authenticated;
revoke execute on function private.ensure_social_relationship_v2(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.are_players_blocked_v2(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.social_relationship_snapshot_v2(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.seed_player_privacy_settings_v2()
  from public, anon, authenticated;
revoke execute on function private.enqueue_contract_event_v2(
  text, text, uuid, bigint, uuid, uuid, uuid, jsonb, text
) from public, anon, authenticated;
revoke execute on function public.get_relationship_v2(uuid)
  from public, anon;
revoke execute on function public.list_friendships_v2(integer, uuid)
  from public, anon;

grant execute on function private.are_players_blocked_v2(uuid, uuid)
  to service_role;
grant execute on function public.get_relationship_v2(uuid)
  to authenticated;
grant execute on function public.list_friendships_v2(integer, uuid)
  to authenticated;
