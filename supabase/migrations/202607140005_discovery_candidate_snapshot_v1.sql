-- Authoritative Discovery candidate snapshots and opaque cursor pagination.
-- Candidate eligibility is delegated to Mission 1; Match Intent and
-- relationship semantics remain Mission 2-owned.

create table private.discovery_snapshots_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  viewer_player_id uuid not null references public.players(id) on delete cascade,
  match_intent_id uuid not null references public.match_intents_v1(id) on delete cascade,
  intent_version bigint not null check (intent_version > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  total_candidates integer not null default 0 check (total_candidates >= 0),
  check (expires_at > created_at)
);

create table private.discovery_snapshot_candidates_v1 (
  snapshot_id uuid not null references private.discovery_snapshots_v1(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  candidate_player_id uuid not null references public.players(id) on delete cascade,
  score integer not null,
  payload jsonb not null,
  primary key (snapshot_id, ordinal),
  unique (snapshot_id, candidate_player_id)
);

create table private.discovery_cursors_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  snapshot_id uuid not null references private.discovery_snapshots_v1(id) on delete cascade,
  next_ordinal integer not null check (next_ordinal > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (snapshot_id, next_ordinal)
);

create index discovery_snapshots_viewer_created_v1_idx
  on private.discovery_snapshots_v1 (viewer_player_id, created_at desc);
create index discovery_snapshot_candidates_player_v1_idx
  on private.discovery_snapshot_candidates_v1 (candidate_player_id, snapshot_id);
create index discovery_cursors_expiry_v1_idx
  on private.discovery_cursors_v1 (expires_at);

create or replace function private.discovery_reads_enabled_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select config.reads_enabled
  from private.match_authority_config_v1 config
  where config.singleton
$$;

create or replace function private.create_discovery_snapshot_v1(
  p_viewer_player_id uuid,
  p_viewer_legacy_profile_id uuid,
  p_match_intent_id uuid,
  p_intent_version bigint,
  p_viewer_filters jsonb
)
returns private.discovery_snapshots_v1
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_row private.discovery_snapshots_v1%rowtype;
  candidate_count integer;
begin
  insert into private.discovery_snapshots_v1 (
    viewer_player_id,
    match_intent_id,
    intent_version,
    expires_at
  ) values (
    p_viewer_player_id,
    p_match_intent_id,
    p_intent_version,
    now() + interval '10 minutes'
  )
  returning * into snapshot_row;

  with eligible_candidates as (
    select
      candidate.id as candidate_player_id,
      canonical_profile.id as candidate_profile_id,
      canonical_profile.version as candidate_profile_version,
      canonical_profile.legacy_profile_id,
      legacy_profile.display_name,
      case
        when avatar.status = 'ready'
          and avatar.moderation_status = 'approved'
        then legacy_profile.avatar_media_id
        else null
      end as avatar_asset_id,
      rank_row.id as rank_id,
      rank_row.slug as rank_slug,
      rank_row.name as rank_name,
      primary_role.id as role_id,
      primary_role.slug as role_slug,
      primary_role.name as role_name,
      candidate_intent.filters as candidate_filters,
      relationship.decision,
      100
        + case
            when coalesce(candidate_intent.filters ->> 'intentKind', 'normal')
              = coalesce(p_viewer_filters ->> 'intentKind', 'normal')
            then 80 else 0
          end
        + case
            when candidate_intent.filters ->> 'mode'
              = p_viewer_filters ->> 'mode'
            then 40 else 0
          end
        + case
            when candidate_intent.filters ->> 'partyFormat'
              = p_viewer_filters ->> 'partyFormat'
            then 20 else 0
          end as recommendation_score
    from public.players candidate
    join public.player_profiles_v1 canonical_profile
      on canonical_profile.player_id = candidate.id
    join public.profiles legacy_profile
      on legacy_profile.id = canonical_profile.legacy_profile_id
      and legacy_profile.deleted_at is null
    join public.match_intents_v1 candidate_intent
      on candidate_intent.player_id = candidate.id
      and candidate_intent.state = 'active'
      and candidate_intent.expires_at > now()
    left join public.game_profiles game_profile
      on game_profile.profile_id = canonical_profile.legacy_profile_id
    left join public.ranks rank_row on rank_row.id = game_profile.rank_id
    left join public.media_assets avatar
      on avatar.id = legacy_profile.avatar_media_id
      and avatar.deleted_at is null
    left join lateral (
      select roles.id, roles.slug, roles.name
      from public.profile_roles profile_roles
      join public.roles roles on roles.id = profile_roles.role_id
      where profile_roles.profile_id = canonical_profile.legacy_profile_id
      order by roles.slug, roles.id
      limit 1
    ) primary_role on true
    left join public.relationship_decisions_v1 relationship
      on relationship.actor_player_id = p_viewer_player_id
      and relationship.target_player_id = candidate.id
    where candidate.id <> p_viewer_player_id
      and private.is_player_discovery_eligible_v1(candidate.id)
      and not private.are_profiles_blocked(
        p_viewer_legacy_profile_id,
        canonical_profile.legacy_profile_id
      )
      and coalesce(relationship.decision::text, 'none') <> 'pass'
      and not exists (
        select 1
        from public.matches matches
        where matches.player_low_id = least(p_viewer_player_id, candidate.id)
          and matches.player_high_id = greatest(p_viewer_player_id, candidate.id)
      )
  ),
  ranked_candidates as (
    select
      row_number() over (
        order by recommendation_score desc, candidate_player_id
      )::integer as ordinal,
      eligible_candidates.*
    from eligible_candidates
  )
  insert into private.discovery_snapshot_candidates_v1 (
    snapshot_id,
    ordinal,
    candidate_player_id,
    score,
    payload
  )
  select
    snapshot_row.id,
    ranked.ordinal,
    ranked.candidate_player_id,
    ranked.recommendation_score,
    jsonb_build_object(
      'playerId', ranked.candidate_player_id,
      'profileSummary', jsonb_build_object(
        'playerId', ranked.candidate_player_id,
        'profileId', ranked.candidate_profile_id,
        'profileVersion', ranked.candidate_profile_version,
        'displayName', ranked.display_name,
        'avatarAssetId', ranked.avatar_asset_id,
        'avatarUrl', null,
        'rank', case
          when ranked.rank_id is null then null
          else jsonb_build_object(
            'id', ranked.rank_id,
            'slug', ranked.rank_slug,
            'name', ranked.rank_name
          )
        end,
        'primaryRole', case
          when ranked.role_id is null then null
          else jsonb_build_object(
            'id', ranked.role_id,
            'slug', ranked.role_slug,
            'name', ranked.role_name
          )
        end
      ),
      'relationshipState', coalesce(ranked.decision::text, 'none'),
      'capabilities', jsonb_build_object(
        'canLike', ranked.decision is distinct from 'like',
        'canPass', ranked.decision is distinct from 'pass',
        'canInvite', false
      ),
      'recommendationContext', jsonb_build_object(
        'reasonCodes', to_jsonb(array_remove(array[
          'active_now'::text,
          case
            when coalesce(ranked.candidate_filters ->> 'intentKind', 'normal')
              = coalesce(p_viewer_filters ->> 'intentKind', 'normal')
            then 'intent_kind_overlap'
          end,
          case
            when ranked.candidate_filters ->> 'mode'
              = p_viewer_filters ->> 'mode'
            then 'mode_overlap'
          end,
          case
            when ranked.candidate_filters ->> 'partyFormat'
              = p_viewer_filters ->> 'partyFormat'
            then 'party_format_overlap'
          end,
          case when ranked.decision = 'like' then 'previous_like' end
        ], null))
      )
    )
  from ranked_candidates ranked;

  get diagnostics candidate_count = row_count;

  update private.discovery_snapshots_v1
  set total_candidates = candidate_count
  where id = snapshot_row.id
  returning * into snapshot_row;

  return snapshot_row;
end;
$$;

create or replace function public.list_discovery_candidates_v1(
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
  snapshot_row private.discovery_snapshots_v1%rowtype;
  cursor_row private.discovery_cursors_v1%rowtype;
  start_ordinal integer := 1;
  next_ordinal_value integer;
  next_cursor_id uuid;
  page_items jsonb;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1(
      'unauthenticated',
      'Authentication is required.'
    );
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Discovery page limit must be between 1 and 50.'
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
    perform private.raise_core_error_v1(
      'player_not_found',
      'The authenticated player identity was not found.'
    );
  end if;
  actor_player_id := (actor_identity ->> 'playerId')::uuid;
  actor_lifecycle := public.get_player_lifecycle_snapshot_v1(
    actor_player_id,
    false
  );
  perform private.assert_discovery_eligible_v1(actor_lifecycle);

  perform private.expire_match_intent_v1(actor_player_id);
  select * into actor_intent
  from public.match_intents_v1 intents
  where intents.player_id = actor_player_id;

  if actor_intent.id is null or actor_intent.state <> 'active' then
    perform private.raise_core_error_v1(
      'intent_not_active',
      'An active Match Intent is required for Discovery.'
    );
  end if;

  select * into actor_profile
  from public.player_profiles_v1 profiles
  where profiles.id = (actor_identity ->> 'profileId')::uuid;

  if actor_profile.id is null or actor_profile.legacy_profile_id is null then
    perform private.raise_core_error_v1(
      'profile_incomplete',
      'The player profile mapping is incomplete.'
    );
  end if;

  if p_cursor is null then
    snapshot_row := private.create_discovery_snapshot_v1(
      actor_player_id,
      actor_profile.legacy_profile_id,
      actor_intent.id,
      actor_intent.version,
      actor_intent.filters
    );
  else
    select * into cursor_row
    from private.discovery_cursors_v1 cursors
    where cursors.id = p_cursor;

    if cursor_row.id is null or cursor_row.expires_at <= now() then
      perform private.raise_core_error_v1(
        'stale_cursor',
        'The Discovery cursor is invalid or expired.'
      );
    end if;

    select * into snapshot_row
    from private.discovery_snapshots_v1 snapshots
    where snapshots.id = cursor_row.snapshot_id;

    if snapshot_row.id is null
      or snapshot_row.viewer_player_id <> actor_player_id
      or snapshot_row.expires_at <= now()
      or snapshot_row.match_intent_id <> actor_intent.id
      or snapshot_row.intent_version <> actor_intent.version
    then
      perform private.raise_core_error_v1(
        'stale_cursor',
        'The Discovery cursor no longer matches the active intent.'
      );
    end if;

    start_ordinal := cursor_row.next_ordinal;
  end if;

  select coalesce(jsonb_agg(page.payload order by page.ordinal), '[]'::jsonb)
  into page_items
  from (
    select candidates.ordinal, candidates.payload
    from private.discovery_snapshot_candidates_v1 candidates
    where candidates.snapshot_id = snapshot_row.id
      and candidates.ordinal >= start_ordinal
      and candidates.ordinal < start_ordinal + p_limit
    order by candidates.ordinal
  ) page;

  next_ordinal_value := start_ordinal + p_limit;
  if next_ordinal_value <= snapshot_row.total_candidates then
    insert into private.discovery_cursors_v1 (
      snapshot_id,
      next_ordinal,
      expires_at
    ) values (
      snapshot_row.id,
      next_ordinal_value,
      snapshot_row.expires_at
    )
    on conflict (snapshot_id, next_ordinal) do update
      set expires_at = excluded.expires_at
    returning id into next_cursor_id;
  end if;

  return jsonb_build_object(
    'items', page_items,
    'nextCursor', next_cursor_id,
    'snapshot', jsonb_build_object(
      'snapshotId', snapshot_row.id,
      'createdAt', snapshot_row.created_at,
      'expiresAt', snapshot_row.expires_at,
      'intentVersion', snapshot_row.intent_version
    )
  );
end;
$$;

comment on function public.list_discovery_candidates_v1(uuid, integer) is
  'Returns an immutable authoritative candidate snapshot page. Cursor retries return the same semantic page; commands still recheck lifecycle and profile versions.';

revoke all on table private.discovery_snapshots_v1 from public, anon, authenticated;
revoke all on table private.discovery_snapshot_candidates_v1 from public, anon, authenticated;
revoke all on table private.discovery_cursors_v1 from public, anon, authenticated;
grant all on table private.discovery_snapshots_v1 to service_role;
grant all on table private.discovery_snapshot_candidates_v1 to service_role;
grant all on table private.discovery_cursors_v1 to service_role;

revoke execute on function private.discovery_reads_enabled_v1() from public, anon, authenticated;
revoke execute on function private.create_discovery_snapshot_v1(uuid, uuid, uuid, bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.list_discovery_candidates_v1(uuid, integer) from public, anon;
grant execute on function public.list_discovery_candidates_v1(uuid, integer) to authenticated;
