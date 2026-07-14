-- Cohort rollout and emergency stop for Production Match Authority v1.
-- Reads, Match Intent commands, and relationship decisions are independently
-- enabled. Once authoritative writes exist, legacy matching remains disabled by
-- the one-way guard in record_swipe.

alter table private.match_authority_config_v1
  add column emergency_stop boolean not null default false;

create table private.match_authority_cohorts_v1 (
  account_id uuid primary key references auth.users(id) on delete cascade,
  reads_enabled boolean not null default false,
  intent_writes_enabled boolean not null default false,
  decision_writes_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger match_authority_cohorts_v1_set_updated_at
before update on private.match_authority_cohorts_v1
for each row execute function public.set_updated_at();

create or replace function private.match_authority_capability_enabled_v1(
  p_capability text,
  p_account_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config private.match_authority_config_v1%rowtype;
  cohort private.match_authority_cohorts_v1%rowtype;
  globally_enabled boolean;
  cohort_enabled boolean := false;
begin
  if p_capability not in ('reads', 'intent_writes', 'decision_writes') then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Unknown Match Authority rollout capability.'
    );
  end if;

  select * into config
  from private.match_authority_config_v1
  where singleton;

  if config.emergency_stop then
    return false;
  end if;

  globally_enabled := case p_capability
    when 'reads' then config.reads_enabled
    when 'intent_writes' then config.intent_writes_enabled
    when 'decision_writes' then config.decision_writes_enabled
  end;

  if p_account_id is not null then
    select * into cohort
    from private.match_authority_cohorts_v1
    where account_id = p_account_id;

    if found then
      cohort_enabled := case p_capability
        when 'reads' then cohort.reads_enabled
        when 'intent_writes' then cohort.intent_writes_enabled
        when 'decision_writes' then cohort.decision_writes_enabled
      end;
    end if;
  end if;

  return globally_enabled or cohort_enabled;
end;
$$;

create or replace function private.match_intent_writes_enabled_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.match_authority_capability_enabled_v1(
    'intent_writes',
    auth.uid()
  )
$$;

create or replace function private.match_decision_writes_enabled_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.match_authority_capability_enabled_v1(
    'decision_writes',
    auth.uid()
  )
$$;

create or replace function private.discovery_reads_enabled_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.match_authority_capability_enabled_v1('reads', auth.uid())
$$;

create or replace function public.configure_match_authority_cohort_v1(
  p_account_id uuid,
  p_reads_enabled boolean,
  p_intent_writes_enabled boolean,
  p_decision_writes_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cohort private.match_authority_cohorts_v1%rowtype;
begin
  if p_account_id is null
    or p_reads_enabled is null
    or p_intent_writes_enabled is null
    or p_decision_writes_enabled is null
  then
    perform private.raise_core_error_v1(
      'validation_failed',
      'A complete Match Authority cohort configuration is required.'
    );
  end if;

  insert into private.match_authority_cohorts_v1 (
    account_id,
    reads_enabled,
    intent_writes_enabled,
    decision_writes_enabled
  ) values (
    p_account_id,
    p_reads_enabled,
    p_intent_writes_enabled,
    p_decision_writes_enabled
  )
  on conflict (account_id) do update
    set reads_enabled = excluded.reads_enabled,
        intent_writes_enabled = excluded.intent_writes_enabled,
        decision_writes_enabled = excluded.decision_writes_enabled
  returning * into cohort;

  return jsonb_build_object(
    'accountId', cohort.account_id,
    'readsEnabled', cohort.reads_enabled,
    'intentWritesEnabled', cohort.intent_writes_enabled,
    'decisionWritesEnabled', cohort.decision_writes_enabled,
    'updatedAt', cohort.updated_at
  );
end;
$$;

create or replace function public.set_match_authority_emergency_stop_v1(
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  config private.match_authority_config_v1%rowtype;
begin
  if p_enabled is null then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Emergency stop state is required.'
    );
  end if;

  update private.match_authority_config_v1
  set emergency_stop = p_enabled,
      updated_at = now()
  where singleton
  returning * into config;

  return jsonb_build_object(
    'emergencyStop', config.emergency_stop,
    'readsEnabled', config.reads_enabled,
    'intentWritesEnabled', config.intent_writes_enabled,
    'decisionWritesEnabled', config.decision_writes_enabled,
    'updatedAt', config.updated_at
  );
end;
$$;

create or replace function public.get_match_authority_rollout_v1(
  p_account_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'accountId', p_account_id,
    'emergencyStop', config.emergency_stop,
    'global', jsonb_build_object(
      'readsEnabled', config.reads_enabled,
      'intentWritesEnabled', config.intent_writes_enabled,
      'decisionWritesEnabled', config.decision_writes_enabled
    ),
    'effective', jsonb_build_object(
      'readsEnabled', private.match_authority_capability_enabled_v1(
        'reads', p_account_id
      ),
      'intentWritesEnabled', private.match_authority_capability_enabled_v1(
        'intent_writes', p_account_id
      ),
      'decisionWritesEnabled', private.match_authority_capability_enabled_v1(
        'decision_writes', p_account_id
      )
    )
  )
  from private.match_authority_config_v1 config
  where config.singleton
$$;

revoke all on table private.match_authority_cohorts_v1
  from public, anon, authenticated;
grant all on table private.match_authority_cohorts_v1 to service_role;

revoke execute on function private.match_authority_capability_enabled_v1(text, uuid)
  from public, anon, authenticated;
revoke execute on function public.configure_match_authority_cohort_v1(uuid, boolean, boolean, boolean)
  from public, anon, authenticated;
revoke execute on function public.set_match_authority_emergency_stop_v1(boolean)
  from public, anon, authenticated;
revoke execute on function public.get_match_authority_rollout_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.configure_match_authority_cohort_v1(uuid, boolean, boolean, boolean)
  to service_role;
grant execute on function public.set_match_authority_emergency_stop_v1(boolean)
  to service_role;
grant execute on function public.get_match_authority_rollout_v1(uuid)
  to service_role;
