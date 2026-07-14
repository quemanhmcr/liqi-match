-- Core V2 Mission 2 foundation. Recruitment Sets and concrete Play Sessions
-- are separate aggregates. All identity references use canonical players.id.
-- Public tables are RPC-only; direct authenticated access remains denied.

create type public.match_set_state_v2 as enum (
  'open',
  'full',
  'closed',
  'expired'
);

create type public.match_set_close_reason_v2 as enum (
  'owner_closed',
  'converted_to_session',
  'expired',
  'moderation'
);

create type public.party_member_role_v2 as enum ('owner', 'member');
create type public.party_member_state_v2 as enum ('active', 'left', 'removed');

create type public.party_invite_state_v2 as enum (
  'pending',
  'accepted',
  'declined',
  'cancelled',
  'expired'
);

create type public.match_set_join_request_state_v2 as enum (
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'expired'
);

create type public.play_session_source_kind_v2 as enum ('manual', 'match', 'set');

create type public.play_session_state_v2 as enum (
  'draft',
  'recruiting',
  'ready_check',
  'scheduled',
  'in_progress',
  'completion_pending',
  'completed',
  'cancelled',
  'expired',
  'abandoned',
  'disputed'
);

create type public.play_session_ready_check_state_v2 as enum (
  'open',
  'passed',
  'failed',
  'expired',
  'cancelled'
);

create type public.play_session_ready_response_v2 as enum (
  'ready',
  'not_ready'
);

create type public.play_session_completion_claim_kind_v2 as enum (
  'completed',
  'disputed',
  'no_show'
);

create type public.play_session_cancellation_reason_v2 as enum (
  'owner_cancelled',
  'member_unavailable',
  'ready_check_failed',
  'schedule_conflict',
  'safety_block',
  'moderation',
  'other'
);

create type private.play_session_conversation_sync_state_v2 as enum (
  'pending',
  'ready',
  'degraded'
);

create table private.party_session_config_v2 (
  singleton boolean primary key default true check (singleton),
  reads_enabled boolean not null default false,
  creation_writes_enabled boolean not null default false,
  mutation_writes_enabled boolean not null default false,
  reconciliation_writes_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.party_session_config_v2 (singleton)
values (true)
on conflict (singleton) do nothing;

create table private.core_v2_command_audit (
  command_name text not null,
  account_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  actor_player_id uuid not null references public.players(id) on delete restrict,
  correlation_id uuid not null,
  expected_aggregate_version bigint not null check (expected_aggregate_version >= 0),
  audit_metadata jsonb not null check (jsonb_typeof(audit_metadata) = 'object'),
  created_at timestamptz not null default now(),
  primary key (command_name, account_id, idempotency_key),
  foreign key (command_name, account_id, idempotency_key)
    references private.command_receipts_v1 (
      command_name,
      account_id,
      idempotency_key
    ) on delete cascade
);

create table public.match_sets_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_player_id uuid not null references public.players(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  intent_kind text not null check (
    char_length(intent_kind) between 1 and 32
    and intent_kind ~ '^[a-z][a-z0-9_]*$'
  ),
  capacity smallint not null check (capacity between 2 and 5),
  state public.match_set_state_v2 not null default 'open',
  version bigint not null default 1 check (version > 0),
  close_reason public.match_set_close_reason_v2,
  closed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_sets_v2_close_consistency check (
    (
      state in ('closed', 'expired')
      and close_reason is not null
      and closed_at is not null
    )
    or (
      state not in ('closed', 'expired')
      and close_reason is null
      and closed_at is null
    )
  ),
  constraint match_sets_v2_expiry_consistency check (
    state <> 'expired' or expires_at is not null
  )
);

create table public.match_set_members_v2 (
  set_id uuid not null references public.match_sets_v2(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  role public.party_member_role_v2 not null default 'member',
  state public.party_member_state_v2 not null default 'active',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  reason_code text check (reason_code is null or char_length(reason_code) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (set_id, player_id),
  constraint match_set_members_v2_state_timestamps check (
    (state = 'active' and left_at is null)
    or (state <> 'active' and left_at is not null)
  )
);

create table public.match_set_invites_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  set_id uuid not null references public.match_sets_v2(id) on delete restrict,
  inviter_player_id uuid not null references public.players(id) on delete restrict,
  target_player_id uuid not null references public.players(id) on delete restrict,
  state public.party_invite_state_v2 not null default 'pending',
  version bigint not null default 1 check (version > 0),
  expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_set_invites_v2_distinct_players check (
    inviter_player_id <> target_player_id
  ),
  constraint match_set_invites_v2_response_consistency check (
    (state = 'pending' and responded_at is null)
    or (state <> 'pending' and responded_at is not null)
  )
);

create table public.match_set_join_requests_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  set_id uuid not null references public.match_sets_v2(id) on delete restrict,
  requester_player_id uuid not null references public.players(id) on delete restrict,
  state public.match_set_join_request_state_v2 not null default 'pending',
  version bigint not null default 1 check (version > 0),
  expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_set_join_requests_v2_response_consistency check (
    (state = 'pending' and responded_at is null)
    or (state <> 'pending' and responded_at is not null)
  )
);

create table public.play_sessions_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_player_id uuid not null references public.players(id) on delete restrict,
  source_kind public.play_session_source_kind_v2 not null,
  source_match_id uuid references public.matches(id) on delete restrict,
  source_set_id uuid references public.match_sets_v2(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  capacity smallint not null check (capacity between 2 and 5),
  state public.play_session_state_v2 not null default 'draft',
  version bigint not null default 1 check (version > 0),
  membership_version bigint not null default 1 check (membership_version > 0),
  timezone text not null check (char_length(timezone) between 1 and 64),
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancellation_reason public.play_session_cancellation_reason_v2,
  cancelled_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint play_sessions_v2_source_consistency check (
    (source_kind = 'manual' and source_match_id is null and source_set_id is null)
    or (source_kind = 'match' and source_match_id is not null and source_set_id is null)
    or (source_kind = 'set' and source_match_id is null and source_set_id is not null)
  ),
  constraint play_sessions_v2_started_consistency check (
    state not in ('in_progress', 'completion_pending', 'completed', 'disputed')
    or started_at is not null
  ),
  constraint play_sessions_v2_completed_consistency check (
    (state = 'completed' and completed_at is not null)
    or (state <> 'completed' and completed_at is null)
  ),
  constraint play_sessions_v2_cancelled_consistency check (
    (
      state = 'cancelled'
      and cancellation_reason is not null
      and cancelled_at is not null
    )
    or (
      state <> 'cancelled'
      and cancellation_reason is null
      and cancelled_at is null
    )
  )
);

create table public.play_session_members_v2 (
  session_id uuid not null references public.play_sessions_v2(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  role public.party_member_role_v2 not null default 'member',
  state public.party_member_state_v2 not null default 'active',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  reason_code text check (reason_code is null or char_length(reason_code) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, player_id),
  constraint play_session_members_v2_state_timestamps check (
    (state = 'active' and left_at is null)
    or (state <> 'active' and left_at is not null)
  )
);

create table public.play_session_invites_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.play_sessions_v2(id) on delete restrict,
  inviter_player_id uuid not null references public.players(id) on delete restrict,
  target_player_id uuid not null references public.players(id) on delete restrict,
  state public.party_invite_state_v2 not null default 'pending',
  version bigint not null default 1 check (version > 0),
  expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint play_session_invites_v2_distinct_players check (
    inviter_player_id <> target_player_id
  ),
  constraint play_session_invites_v2_response_consistency check (
    (state = 'pending' and responded_at is null)
    or (state <> 'pending' and responded_at is not null)
  )
);

create table public.play_session_role_assignments_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.play_sessions_v2(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  role_slug text not null check (
    char_length(role_slug) between 1 and 32
    and role_slug ~ '^[a-z0-9_]+$'
  ),
  assigned_by_player_id uuid not null references public.players(id) on delete restrict,
  active boolean not null default true,
  version bigint not null default 1 check (version > 0),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint play_session_role_assignments_v2_active_consistency check (
    (active and revoked_at is null) or (not active and revoked_at is not null)
  )
);

create table public.play_session_ready_checks_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.play_sessions_v2(id) on delete restrict,
  state public.play_session_ready_check_state_v2 not null default 'open',
  version bigint not null default 1 check (version > 0),
  required_membership_version bigint not null check (required_membership_version > 0),
  required_player_ids uuid[] not null check (
    cardinality(required_player_ids) between 2 and 5
  ),
  opened_by_player_id uuid not null references public.players(id) on delete restrict,
  opened_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  passed_at timestamptz,
  closed_at timestamptz,
  constraint play_session_ready_checks_v2_deadline check (deadline_at > opened_at),
  constraint play_session_ready_checks_v2_state_consistency check (
    (state = 'open' and passed_at is null and closed_at is null)
    or (state = 'passed' and passed_at is not null and closed_at is not null)
    or (state in ('failed', 'expired', 'cancelled') and passed_at is null and closed_at is not null)
  )
);

create table public.play_session_ready_responses_v2 (
  ready_check_id uuid not null references public.play_session_ready_checks_v2(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  response public.play_session_ready_response_v2 not null,
  version bigint not null default 1 check (version > 0),
  responded_at timestamptz not null default now(),
  primary key (ready_check_id, player_id)
);

create table public.play_session_completion_claims_v2 (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.play_sessions_v2(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  kind public.play_session_completion_claim_kind_v2 not null,
  reason_code text,
  claimed_at timestamptz not null default now(),
  unique (session_id, player_id),
  constraint play_session_completion_claims_v2_reason check (
    (kind = 'completed' and reason_code is null)
    or (
      kind <> 'completed'
      and reason_code is not null
      and char_length(reason_code) between 1 and 64
    )
  )
);

create table private.play_session_conversation_projection_v2 (
  session_id uuid primary key references public.play_sessions_v2(id) on delete restrict,
  conversation_id uuid,
  source_aggregate_version bigint not null default 0 check (source_aggregate_version >= 0),
  membership_version bigint not null default 0 check (membership_version >= 0),
  accepted_membership jsonb not null default '{"members":[]}'::jsonb check (
    jsonb_typeof(accepted_membership) = 'object'
  ),
  state private.play_session_conversation_sync_state_v2 not null default 'pending',
  last_error_code text,
  updated_at timestamptz not null default now(),
  constraint play_session_conversation_projection_v2_ready check (
    state <> 'ready' or conversation_id is not null
  )
);

create unique index match_set_members_v2_active_owner_idx
  on public.match_set_members_v2 (set_id)
  where state = 'active' and role = 'owner';
create index match_set_members_v2_active_player_idx
  on public.match_set_members_v2 (player_id, set_id)
  where state = 'active';
create unique index match_set_invites_v2_pending_target_idx
  on public.match_set_invites_v2 (set_id, target_player_id)
  where state = 'pending';
create unique index match_set_join_requests_v2_pending_player_idx
  on public.match_set_join_requests_v2 (set_id, requester_player_id)
  where state = 'pending';
create index match_sets_v2_recruitment_idx
  on public.match_sets_v2 (state, updated_at desc)
  where state in ('open', 'full');

create unique index play_sessions_v2_source_match_idx
  on public.play_sessions_v2 (source_match_id)
  where source_match_id is not null;
create unique index play_sessions_v2_source_set_idx
  on public.play_sessions_v2 (source_set_id)
  where source_set_id is not null;
create index play_sessions_v2_owner_state_idx
  on public.play_sessions_v2 (owner_player_id, state, updated_at desc);
create unique index play_session_members_v2_active_owner_idx
  on public.play_session_members_v2 (session_id)
  where state = 'active' and role = 'owner';
create index play_session_members_v2_active_player_idx
  on public.play_session_members_v2 (player_id, session_id)
  where state = 'active';
create unique index play_session_invites_v2_pending_target_idx
  on public.play_session_invites_v2 (session_id, target_player_id)
  where state = 'pending';
create unique index play_session_role_assignments_v2_active_player_idx
  on public.play_session_role_assignments_v2 (session_id, player_id)
  where active;
create unique index play_session_ready_checks_v2_open_idx
  on public.play_session_ready_checks_v2 (session_id)
  where state = 'open';
create index play_session_ready_checks_v2_deadline_idx
  on public.play_session_ready_checks_v2 (deadline_at)
  where state = 'open';

create trigger party_session_config_v2_set_updated_at
before update on private.party_session_config_v2
for each row execute function public.set_updated_at();
create trigger match_sets_v2_set_updated_at
before update on public.match_sets_v2
for each row execute function public.set_updated_at();
create trigger match_set_members_v2_set_updated_at
before update on public.match_set_members_v2
for each row execute function public.set_updated_at();
create trigger match_set_invites_v2_set_updated_at
before update on public.match_set_invites_v2
for each row execute function public.set_updated_at();
create trigger match_set_join_requests_v2_set_updated_at
before update on public.match_set_join_requests_v2
for each row execute function public.set_updated_at();
create trigger play_sessions_v2_set_updated_at
before update on public.play_sessions_v2
for each row execute function public.set_updated_at();
create trigger play_session_members_v2_set_updated_at
before update on public.play_session_members_v2
for each row execute function public.set_updated_at();
create trigger play_session_invites_v2_set_updated_at
before update on public.play_session_invites_v2
for each row execute function public.set_updated_at();
create trigger play_session_conversation_projection_v2_set_updated_at
before update on private.play_session_conversation_projection_v2
for each row execute function public.set_updated_at();

alter table public.match_sets_v2 enable row level security;
alter table public.match_set_members_v2 enable row level security;
alter table public.match_set_invites_v2 enable row level security;
alter table public.match_set_join_requests_v2 enable row level security;
alter table public.play_sessions_v2 enable row level security;
alter table public.play_session_members_v2 enable row level security;
alter table public.play_session_invites_v2 enable row level security;
alter table public.play_session_role_assignments_v2 enable row level security;
alter table public.play_session_ready_checks_v2 enable row level security;
alter table public.play_session_ready_responses_v2 enable row level security;
alter table public.play_session_completion_claims_v2 enable row level security;

revoke all on private.party_session_config_v2 from public, anon, authenticated;
revoke all on private.core_v2_command_audit from public, anon, authenticated;
revoke all on private.play_session_conversation_projection_v2 from public, anon, authenticated;

grant all on private.party_session_config_v2 to service_role;
grant all on private.core_v2_command_audit to service_role;
grant all on private.play_session_conversation_projection_v2 to service_role;

revoke all on public.match_sets_v2 from public, anon, authenticated;
revoke all on public.match_set_members_v2 from public, anon, authenticated;
revoke all on public.match_set_invites_v2 from public, anon, authenticated;
revoke all on public.match_set_join_requests_v2 from public, anon, authenticated;
revoke all on public.play_sessions_v2 from public, anon, authenticated;
revoke all on public.play_session_members_v2 from public, anon, authenticated;
revoke all on public.play_session_invites_v2 from public, anon, authenticated;
revoke all on public.play_session_role_assignments_v2 from public, anon, authenticated;
revoke all on public.play_session_ready_checks_v2 from public, anon, authenticated;
revoke all on public.play_session_ready_responses_v2 from public, anon, authenticated;
revoke all on public.play_session_completion_claims_v2 from public, anon, authenticated;

grant all on public.match_sets_v2 to service_role;
grant all on public.match_set_members_v2 to service_role;
grant all on public.match_set_invites_v2 to service_role;
grant all on public.match_set_join_requests_v2 to service_role;
grant all on public.play_sessions_v2 to service_role;
grant all on public.play_session_members_v2 to service_role;
grant all on public.play_session_invites_v2 to service_role;
grant all on public.play_session_role_assignments_v2 to service_role;
grant all on public.play_session_ready_checks_v2 to service_role;
grant all on public.play_session_ready_responses_v2 to service_role;
grant all on public.play_session_completion_claims_v2 to service_role;

create or replace function private.resolve_party_session_actor_v2(
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
      'unauthenticated',
      'Authentication is required.'
    );
  end if;

  identity_mapping := public.resolve_player_identity_v1(actor_account_id, p_lock);
  if identity_mapping is null then
    perform private.raise_core_error_v1(
      'lifecycle_not_active',
      'The authenticated account has no canonical Player identity.'
    );
  end if;

  lifecycle_snapshot := public.get_player_lifecycle_snapshot_v1(
    (identity_mapping ->> 'playerId')::uuid,
    p_lock
  );
  if lifecycle_snapshot is null then
    perform private.raise_core_error_v1(
      'not_found',
      'The authenticated player does not exist.'
    );
  end if;

  if p_require_active and lifecycle_snapshot ->> 'state' <> 'active' then
    perform private.raise_core_error_v1(
      'lifecycle_not_active',
      'The authenticated player lifecycle must be active.',
      false,
      jsonb_build_object('state', lifecycle_snapshot ->> 'state')
    );
  end if;

  return identity_mapping || jsonb_build_object('lifecycle', lifecycle_snapshot);
end;
$$;

create or replace function private.assert_party_session_player_active_v2(
  p_player_id uuid,
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
  if p_player_id is null then
    perform private.raise_core_error_v1(
      'not_found',
      'A canonical PlayerId is required.'
    );
  end if;

  lifecycle_snapshot := public.get_player_lifecycle_snapshot_v1(p_player_id, p_lock);
  if lifecycle_snapshot is null then
    perform private.raise_core_error_v1('not_found', 'The player does not exist.');
  end if;
  if lifecycle_snapshot ->> 'state' <> 'active' then
    perform private.raise_core_error_v1(
      'lifecycle_not_active',
      'The player lifecycle must be active.',
      false,
      jsonb_build_object('state', lifecycle_snapshot ->> 'state')
    );
  end if;

  return lifecycle_snapshot;
end;
$$;

create or replace function private.assert_session_invite_eligible_v2(
  p_actor_player_id uuid,
  p_target_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  relationship_snapshot jsonb;
  capabilities jsonb;
begin
  if p_actor_player_id is null or p_target_player_id is null then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Both canonical PlayerIds are required.'
    );
  end if;
  if p_actor_player_id = p_target_player_id then
    perform private.raise_core_error_v1(
      'validation_failed',
      'A player cannot invite themselves.'
    );
  end if;

  perform private.assert_party_session_player_active_v2(p_target_player_id, false);
  relationship_snapshot := private.social_relationship_snapshot_v2(
    p_actor_player_id,
    p_target_player_id
  );
  capabilities := relationship_snapshot -> 'capabilities';

  if coalesce((capabilities ->> 'blocked')::boolean, false) then
    perform private.raise_core_error_v1(
      'relationship_blocked',
      'Relationship authority denied this Session invitation.'
    );
  end if;
  if not coalesce((capabilities ->> 'canInviteToSession')::boolean, false) then
    perform private.raise_core_error_v1(
      'invitation_not_allowed',
      'The target privacy policy does not allow this Session invitation.'
    );
  end if;

  return relationship_snapshot;
end;
$$;

create or replace function private.assert_party_session_feature_v2(
  p_operation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  config_row private.party_session_config_v2;
  enabled boolean;
begin
  select config.* into config_row
  from private.party_session_config_v2 config
  where config.singleton;

  enabled := case p_operation
    when 'read' then config_row.reads_enabled
    when 'create' then config_row.creation_writes_enabled
    when 'mutate' then config_row.mutation_writes_enabled
    when 'reconcile' then config_row.reconciliation_writes_enabled
    else false
  end;

  if not coalesce(enabled, false) then
    perform private.raise_core_error_v1(
      'feature_disabled',
      'Core V2 Party and Play Session operation is disabled.',
      false,
      jsonb_build_object('operation', p_operation)
    );
  end if;
end;
$$;

create or replace function private.record_core_v2_command_audit(
  p_command_name text,
  p_account_id uuid,
  p_idempotency_key text,
  p_actor_player_id uuid,
  p_correlation_id uuid,
  p_expected_aggregate_version bigint,
  p_audit_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_correlation_id is null then
    perform private.raise_core_error_v1(
      'validation_failed',
      'correlationId is required.'
    );
  end if;
  if jsonb_typeof(p_audit_metadata) is distinct from 'object' then
    perform private.raise_core_error_v1(
      'validation_failed',
      'audit metadata must be a JSON object.'
    );
  end if;
  if not (
    p_audit_metadata ? 'appVersion'
    and p_audit_metadata ? 'clientCreatedAt'
    and p_audit_metadata ? 'clientRequestId'
    and p_audit_metadata ? 'platform'
  ) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'audit metadata is missing a required field.'
    );
  end if;
  if char_length(btrim(p_audit_metadata ->> 'appVersion')) not between 1 and 64
    or (p_audit_metadata ->> 'clientCreatedAt')
      !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
    or (p_audit_metadata ->> 'clientRequestId')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or (p_audit_metadata ->> 'platform') not in ('android', 'ios', 'web')
    or (
      p_audit_metadata ? 'deviceInstallationId'
      and (p_audit_metadata ->> 'deviceInstallationId')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'audit metadata contains an invalid field.'
    );
  end if;

  insert into private.core_v2_command_audit (
    command_name,
    account_id,
    idempotency_key,
    actor_player_id,
    correlation_id,
    expected_aggregate_version,
    audit_metadata
  ) values (
    p_command_name,
    p_account_id,
    p_idempotency_key,
    p_actor_player_id,
    p_correlation_id,
    p_expected_aggregate_version,
    p_audit_metadata
  )
  on conflict (command_name, account_id, idempotency_key) do nothing;
end;
$$;

create or replace function private.match_set_membership_snapshot_v2(p_set_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'playerId', members.player_id,
        'role', members.role,
        'state', members.state,
        'joinedAt', members.joined_at,
        'leftAt', members.left_at
      ) order by
        case when members.role = 'owner' then 0 else 1 end,
        members.joined_at,
        members.player_id
    ),
    '[]'::jsonb
  )
  from public.match_set_members_v2 members
  where members.set_id = p_set_id;
$$;

create or replace function private.match_set_snapshot_v2(p_set_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'setId', sets.id,
    'ownerPlayerId', sets.owner_player_id,
    'title', sets.title,
    'intentKind', sets.intent_kind,
    'capacity', sets.capacity,
    'state', sets.state,
    'version', sets.version,
    'closeReason', sets.close_reason,
    'closedAt', sets.closed_at,
    'createdAt', sets.created_at,
    'updatedAt', sets.updated_at,
    'members', private.match_set_membership_snapshot_v2(sets.id)
  )
  from public.match_sets_v2 sets
  where sets.id = p_set_id;
$$;

create or replace function private.play_session_membership_snapshot_v2(
  p_session_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'sessionId', sessions.id,
    'membershipVersion', sessions.membership_version,
    'members', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'playerId', members.player_id,
            'role', members.role
          ) order by
            case when members.role = 'owner' then 0 else 1 end,
            members.joined_at,
            members.player_id
        )
        from public.play_session_members_v2 members
        where members.session_id = sessions.id
          and members.state = 'active'
      ),
      '[]'::jsonb
    )
  )
  from public.play_sessions_v2 sessions
  where sessions.id = p_session_id;
$$;

create or replace function private.play_session_snapshot_v2(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'sessionId', sessions.id,
    'ownerPlayerId', sessions.owner_player_id,
    'source', case sessions.source_kind
      when 'match' then jsonb_build_object('kind', 'match', 'matchId', sessions.source_match_id)
      when 'set' then jsonb_build_object('kind', 'set', 'setId', sessions.source_set_id)
      else jsonb_build_object('kind', 'manual')
    end,
    'title', sessions.title,
    'capacity', sessions.capacity,
    'state', sessions.state,
    'version', sessions.version,
    'membershipVersion', sessions.membership_version,
    'timezone', sessions.timezone,
    'scheduledFor', sessions.scheduled_for,
    'startedAt', sessions.started_at,
    'completedAt', sessions.completed_at,
    'cancellationReason', sessions.cancellation_reason,
    'cancelledAt', sessions.cancelled_at,
    'createdAt', sessions.created_at,
    'updatedAt', sessions.updated_at,
    'communication', jsonb_build_object(
      'conversationId', conversation.conversation_id,
      'membershipVersion', coalesce(conversation.membership_version, 0),
      'status', coalesce(conversation.state::text, 'pending')
    ),
    'members', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'playerId', members.player_id,
            'role', members.role,
            'state', members.state,
            'joinedAt', members.joined_at,
            'leftAt', members.left_at
          ) order by members.joined_at, members.player_id
        )
        from public.play_session_members_v2 members
        where members.session_id = sessions.id
      ),
      '[]'::jsonb
    ),
    'roleAssignments', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'assignmentId', assignments.id,
            'playerId', assignments.player_id,
            'roleSlug', assignments.role_slug,
            'assignedAt', assignments.assigned_at
          ) order by assignments.assigned_at, assignments.id
        )
        from public.play_session_role_assignments_v2 assignments
        where assignments.session_id = sessions.id
          and assignments.active
      ),
      '[]'::jsonb
    ),
    'readyCheck', (
      select jsonb_build_object(
        'checkId', checks.id,
        'state', checks.state,
        'version', checks.version,
        'requiredPlayerIds', to_jsonb(checks.required_player_ids),
        'openedAt', checks.opened_at,
        'deadlineAt', checks.deadline_at,
        'responses', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'playerId', responses.player_id,
                'response', responses.response,
                'respondedAt', responses.responded_at
              ) order by responses.responded_at, responses.player_id
            )
            from public.play_session_ready_responses_v2 responses
            where responses.ready_check_id = checks.id
          ),
          '[]'::jsonb
        )
      )
      from public.play_session_ready_checks_v2 checks
      where checks.session_id = sessions.id
      order by checks.opened_at desc, checks.id desc
      limit 1
    ),
    'completionClaims', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'claimId', claims.id,
            'playerId', claims.player_id,
            'kind', claims.kind,
            'reasonCode', claims.reason_code,
            'claimedAt', claims.claimed_at
          ) order by claims.claimed_at, claims.id
        )
        from public.play_session_completion_claims_v2 claims
        where claims.session_id = sessions.id
      ),
      '[]'::jsonb
    )
  )
  from public.play_sessions_v2 sessions
  left join private.play_session_conversation_projection_v2 conversation
    on conversation.session_id = sessions.id
  where sessions.id = p_session_id;
$$;

revoke execute on function private.resolve_party_session_actor_v2(boolean, boolean)
  from public, anon, authenticated;
revoke execute on function private.assert_party_session_player_active_v2(uuid, boolean)
  from public, anon, authenticated;
revoke execute on function private.assert_session_invite_eligible_v2(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.assert_party_session_feature_v2(text)
  from public, anon, authenticated;
revoke execute on function private.record_core_v2_command_audit(text, uuid, text, uuid, uuid, bigint, jsonb)
  from public, anon, authenticated;
revoke execute on function private.match_set_membership_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.match_set_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.play_session_membership_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.play_session_snapshot_v2(uuid)
  from public, anon, authenticated;

grant execute on function private.resolve_party_session_actor_v2(boolean, boolean)
  to service_role;
grant execute on function private.assert_party_session_player_active_v2(uuid, boolean)
  to service_role;
grant execute on function private.assert_session_invite_eligible_v2(uuid, uuid)
  to service_role;
grant execute on function private.assert_party_session_feature_v2(text)
  to service_role;
grant execute on function private.record_core_v2_command_audit(text, uuid, text, uuid, uuid, bigint, jsonb)
  to service_role;
grant execute on function private.match_set_membership_snapshot_v2(uuid)
  to service_role;
grant execute on function private.match_set_snapshot_v2(uuid)
  to service_role;
grant execute on function private.play_session_membership_snapshot_v2(uuid)
  to service_role;
grant execute on function private.play_session_snapshot_v2(uuid)
  to service_role;
