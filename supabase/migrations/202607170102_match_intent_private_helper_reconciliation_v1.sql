-- Reconcile private Match Intent helpers for databases that deployed the
-- historical production_match_authority_v1 before canonical filter and snapshot
-- helpers were folded into that migration. These helpers are deterministic
-- support functions for the public activation/read/pause RPC surface.

create or replace function private.canonical_match_intent_filters_v1(p_filters jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  role_slugs jsonb;
  intent_kind text;
  canonical_filters jsonb;
begin
  if jsonb_typeof(p_filters) is distinct from 'object' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Match Intent filters must be an object.'
    );
  end if;

  role_slugs := coalesce(p_filters -> 'roleSlugs', '[]'::jsonb);
  if jsonb_typeof(role_slugs) <> 'array'
    or jsonb_array_length(role_slugs) > 2
    or exists (
      select 1
      from jsonb_array_elements_text(role_slugs) role_slug(value)
      where role_slug.value !~ '^[a-z0-9_]+$'
    )
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'roleSlugs must contain at most two canonical slugs.'
    );
  end if;

  intent_kind := coalesce(
    nullif(p_filters ->> 'intentKind', ''),
    case p_filters ->> 'mode' when 'ranked' then 'rank' else 'normal' end
  );

  canonical_filters := jsonb_build_object(
    'intentKind', intent_kind,
    'mode', p_filters ->> 'mode',
    'partyFormat', p_filters ->> 'partyFormat',
    'sessionPlan', p_filters ->> 'sessionPlan',
    'roleSlugs', role_slugs,
    'timezone', p_filters ->> 'timezone'
  );

  if canonical_filters ->> 'intentKind' not in (
      'normal', 'rank', 'team_rank', 'set_love', 'soulmate'
    )
    or canonical_filters ->> 'mode' not in ('normal', 'ranked')
    or canonical_filters ->> 'partyFormat' not in ('duo', 'full_team', 'flex')
    or canonical_filters ->> 'sessionPlan' not in ('quick', 'long')
    or nullif(canonical_filters ->> 'timezone', '') is null
    or char_length(canonical_filters ->> 'timezone') > 64
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Match Intent filters are invalid.'
    );
  end if;

  return canonical_filters;
end;
$$;

create or replace function private.match_intent_snapshot_v1(p_intent_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'matchIntentId', intents.id,
    'playerId', intents.player_id,
    'state', intents.state,
    'filters', intents.filters,
    'version', intents.version,
    'activatedAt', intents.activated_at,
    'expiresAt', intents.expires_at
  )
  from public.match_intents_v1 intents
  where intents.id = p_intent_id
$$;

revoke execute on function private.canonical_match_intent_filters_v1(jsonb)
  from public, anon, authenticated;
revoke execute on function private.match_intent_snapshot_v1(uuid)
  from public, anon, authenticated;
grant execute on function private.canonical_match_intent_filters_v1(jsonb)
  to service_role;
grant execute on function private.match_intent_snapshot_v1(uuid)
  to service_role;
