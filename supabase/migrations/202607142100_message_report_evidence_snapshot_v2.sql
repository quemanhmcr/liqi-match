-- Immutable message-report evidence capture for the current Conversation V1
-- authority. Social owns report initiation and the report receipt; Conversation
-- owns the privileged content snapshot behind a reporter-only RPC.
--
-- The private V1 compatibility table deliberately does not reuse the public
-- Conversation V2 evidence table name. A future Conversation V2 provider can
-- replace the RPC implementation without rewriting report history.

create table private.message_report_evidence_v1 (
  id uuid primary key default extensions.gen_random_uuid(),
  report_id uuid not null unique references public.reports_v2(id) on delete restrict,
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  message_id uuid not null references public.messages(id) on delete restrict,
  reporter_player_id uuid not null references public.players(id) on delete restrict,
  sender_player_id uuid not null references public.players(id) on delete restrict,
  client_message_id text not null,
  message_sequence bigint not null check (message_sequence > 0),
  content_kind public.message_content_kind_v1 not null,
  content_snapshot jsonb not null check (jsonb_typeof(content_snapshot) = 'object'),
  content_fingerprint text not null,
  message_created_at timestamptz not null,
  message_tombstoned_at timestamptz,
  captured_at timestamptz not null default now()
);

create index message_report_evidence_v1_message_idx
  on private.message_report_evidence_v1 (message_id, captured_at desc);

revoke all on private.message_report_evidence_v1
  from public, anon, authenticated;
grant all on private.message_report_evidence_v1 to service_role;

create or replace function private.capture_message_report_snapshot_v2(
  p_report_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_row public.reports_v2%rowtype;
  message_row public.messages%rowtype;
  evidence_id_value uuid;
begin
  select evidence.id into evidence_id_value
  from private.message_report_evidence_v1 evidence
  where evidence.report_id = p_report_id;
  if evidence_id_value is not null then
    return evidence_id_value;
  end if;

  select reports.* into report_row
  from public.reports_v2 reports
  where reports.id = p_report_id;
  if report_row.id is null or report_row.target_kind <> 'message' then
    perform private.raise_core_error_v1(
      'report_target_not_found',
      'Message report was not found.'
    );
  end if;
  if report_row.conversation_id is null or report_row.message_id is null then
    -- Conversation V2 adds separate optional IDs to reports_v2. The V1
    -- compatibility trigger must not reject or redefine those reports; their
    -- authoritative provider captures public.message_report_evidence_v2 in the
    -- same transaction. to_jsonb keeps this migration compilable before or
    -- after the additive Conversation V2 columns exist.
    if nullif(to_jsonb(report_row) ->> 'conversation_v2_id', '') is not null
      and nullif(to_jsonb(report_row) ->> 'message_v2_id', '') is not null
    then
      return null;
    end if;
    perform private.raise_core_error_v1(
      'report_evidence_invalid',
      'Message report does not reference a canonical conversation message.'
    );
  end if;

  select messages.* into message_row
  from public.messages messages
  where messages.id = report_row.message_id
    and messages.conversation_id = report_row.conversation_id
    and messages.schema_version_v1 = 1;
  if message_row.id is null then
    perform private.raise_core_error_v1(
      'report_target_not_found',
      'The authoritative conversation message no longer exists.'
    );
  end if;
  if message_row.sender_player_id_v1 is distinct from report_row.target_player_id then
    perform private.raise_core_error_v1(
      'report_evidence_invalid',
      'The report target does not match the authoritative message sender.'
    );
  end if;

  insert into private.message_report_evidence_v1 (
    report_id,
    conversation_id,
    message_id,
    reporter_player_id,
    sender_player_id,
    client_message_id,
    message_sequence,
    content_kind,
    content_snapshot,
    content_fingerprint,
    message_created_at,
    message_tombstoned_at
  ) values (
    report_row.id,
    message_row.conversation_id,
    message_row.id,
    report_row.reporter_player_id,
    message_row.sender_player_id_v1,
    message_row.client_message_id_v1,
    message_row.sequence_v1,
    message_row.content_kind_v1,
    message_row.content_v1,
    private.command_request_hash_v1(message_row.content_v1),
    message_row.created_at,
    message_row.deleted_at
  ) on conflict (report_id) do nothing
  returning id into evidence_id_value;

  if evidence_id_value is null then
    select evidence.id into evidence_id_value
    from private.message_report_evidence_v1 evidence
    where evidence.report_id = report_row.id;
  end if;
  return evidence_id_value;
end;
$$;

create or replace function private.capture_message_report_snapshot_trigger_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.target_kind = 'message' then
    perform private.capture_message_report_snapshot_v2(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists reports_capture_message_snapshot_v2 on public.reports_v2;
create trigger reports_capture_message_snapshot_v2
after insert on public.reports_v2
for each row
when (new.target_kind = 'message')
execute function private.capture_message_report_snapshot_trigger_v2();

-- Safe backfill for reports created before this trigger. Missing source rows are
-- intentionally skipped; the privileged RPC then returns target_not_found.
insert into private.message_report_evidence_v1 (
  report_id,
  conversation_id,
  message_id,
  reporter_player_id,
  sender_player_id,
  client_message_id,
  message_sequence,
  content_kind,
  content_snapshot,
  content_fingerprint,
  message_created_at,
  message_tombstoned_at
)
select
  reports.id,
  messages.conversation_id,
  messages.id,
  reports.reporter_player_id,
  messages.sender_player_id_v1,
  messages.client_message_id_v1,
  messages.sequence_v1,
  messages.content_kind_v1,
  messages.content_v1,
  private.command_request_hash_v1(messages.content_v1),
  messages.created_at,
  messages.deleted_at
from public.reports_v2 reports
join public.messages messages
  on messages.id = reports.message_id
 and messages.conversation_id = reports.conversation_id
 and messages.schema_version_v1 = 1
 and messages.sender_player_id_v1 = reports.target_player_id
where reports.target_kind = 'message'
  and not exists (
    select 1
    from private.message_report_evidence_v1 evidence
    where evidence.report_id = reports.id
  )
on conflict (report_id) do nothing;

create or replace function private.prevent_message_report_snapshot_mutation_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.raise_core_error_v1(
    'report_evidence_immutable',
    'Immutable message report evidence cannot be changed or deleted.'
  );
  return old;
end;
$$;

create trigger message_report_evidence_v1_immutable
before update or delete on private.message_report_evidence_v1
for each row
execute function private.prevent_message_report_snapshot_mutation_v2();

create or replace function public.capture_message_report_evidence_v2(
  p_report_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  actor_player_id uuid;
  report_row public.reports_v2%rowtype;
  evidence_row private.message_report_evidence_v1%rowtype;
  report_json jsonb;
  conversation_v2_id_value uuid;
  message_v2_id_value uuid;
  v2_member_exists boolean;
  v2_evidence jsonb;
begin
  actor := private.resolve_social_actor_v2(false, false);
  actor_player_id := (actor ->> 'playerId')::uuid;

  select reports.* into report_row
  from public.reports_v2 reports
  where reports.id = p_report_id;
  if report_row.id is null or report_row.target_kind <> 'message' then
    perform private.raise_core_error_v1(
      'report_target_not_found',
      'Message report was not found.'
    );
  end if;
  if report_row.reporter_player_id <> actor_player_id then
    perform private.raise_core_error_v1(
      'report_evidence_invalid',
      'Only the original reporter may read message report evidence.'
    );
  end if;

  if report_row.conversation_id is not null and report_row.message_id is not null then
    perform private.capture_message_report_snapshot_v2(report_row.id);
    select evidence.* into evidence_row
    from private.message_report_evidence_v1 evidence
    where evidence.report_id = report_row.id;
    if evidence_row.id is null then
      perform private.raise_core_error_v1(
        'report_target_not_found',
        'Immutable message report evidence was not found.'
      );
    end if;

    return jsonb_build_object(
      'evidenceId', evidence_row.id,
      'conversationId', evidence_row.conversation_id,
      'message', jsonb_build_object(
        'messageId', evidence_row.message_id,
        'conversationId', evidence_row.conversation_id,
        'senderPlayerId', evidence_row.sender_player_id,
        'clientMessageId', evidence_row.client_message_id,
        'sequence', evidence_row.message_sequence,
        'content', evidence_row.content_snapshot,
        'createdAt', evidence_row.message_created_at,
        'tombstonedAt', evidence_row.message_tombstoned_at
      ),
      'reporterPlayerId', evidence_row.reporter_player_id,
      'capturedAt', evidence_row.captured_at
    );
  end if;

  -- Optional Conversation V2 compatibility. All references to V2-only tables
  -- and columns are dynamic so this migration remains additive on a V1-only
  -- branch. It does not define friendship, conversation membership, or evidence
  -- semantics; it delegates to the Conversation-owned tables when present.
  report_json := to_jsonb(report_row);
  begin
    conversation_v2_id_value := nullif(report_json ->> 'conversation_v2_id', '')::uuid;
    message_v2_id_value := nullif(report_json ->> 'message_v2_id', '')::uuid;
  exception when others then
    perform private.raise_core_error_v1(
      'report_evidence_invalid',
      'Conversation V2 report identifiers are invalid.'
    );
  end;
  if conversation_v2_id_value is null or message_v2_id_value is null then
    perform private.raise_core_error_v1(
      'report_evidence_invalid',
      'Message report does not reference a supported conversation authority.'
    );
  end if;
  if to_regclass('public.message_report_evidence_v2') is null
    or to_regclass('public.messages_v2') is null
    or to_regclass('public.conversation_members_v2') is null
  then
    perform private.raise_core_error_v1(
      'report_evidence_invalid',
      'Conversation V2 evidence provider is not installed.'
    );
  end if;

  execute $query$
    select exists (
      select 1
      from public.conversation_members_v2 members
      where members.conversation_id = $1
        and members.player_id = $2
    )
  $query$
  into v2_member_exists
  using conversation_v2_id_value, actor_player_id;
  if not coalesce(v2_member_exists, false) then
    perform private.raise_core_error_v1(
      'report_evidence_invalid',
      'Only a current or historical conversation member may read evidence.'
    );
  end if;

  execute $query$
    insert into public.message_report_evidence_v2 (
      report_id,
      conversation_id,
      message_id,
      reporter_player_id,
      sender_player_id,
      message_sequence,
      content_kind,
      content_snapshot,
      content_fingerprint,
      message_created_at,
      message_tombstoned_at
    )
    select
      $1,
      messages.conversation_id,
      messages.id,
      $2,
      messages.sender_player_id,
      messages.sequence,
      messages.kind,
      messages.content,
      messages.content_fingerprint,
      messages.created_at,
      messages.tombstoned_at
    from public.messages_v2 messages
    where messages.id = $3
      and messages.conversation_id = $4
      and messages.sender_player_id = $5
    on conflict (report_id) do nothing
  $query$
  using
    report_row.id,
    actor_player_id,
    message_v2_id_value,
    conversation_v2_id_value,
    report_row.target_player_id;

  execute $query$
    select jsonb_build_object(
      'evidenceId', evidence.id,
      'conversationId', evidence.conversation_id,
      'message', jsonb_build_object(
        'messageId', evidence.message_id,
        'conversationId', evidence.conversation_id,
        'senderPlayerId', evidence.sender_player_id,
        'clientMessageId', messages.client_message_id,
        'sequence', evidence.message_sequence,
        'content', evidence.content_snapshot,
        'createdAt', evidence.message_created_at,
        'tombstonedAt', evidence.message_tombstoned_at
      ),
      'reporterPlayerId', evidence.reporter_player_id,
      'capturedAt', evidence.captured_at
    )
    from public.message_report_evidence_v2 evidence
    join public.messages_v2 messages
      on messages.id = evidence.message_id
     and messages.conversation_id = evidence.conversation_id
    where evidence.report_id = $1
      and evidence.reporter_player_id = $2
  $query$
  into v2_evidence
  using report_row.id, actor_player_id;

  if v2_evidence is null then
    perform private.raise_core_error_v1(
      'report_target_not_found',
      'Immutable Conversation V2 message evidence was not found.'
    );
  end if;
  return v2_evidence;
end;
$$;

revoke execute on function private.capture_message_report_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.capture_message_report_snapshot_trigger_v2()
  from public, anon, authenticated;
revoke execute on function private.prevent_message_report_snapshot_mutation_v2()
  from public, anon, authenticated;
revoke execute on function public.capture_message_report_evidence_v2(uuid)
  from public, anon;
grant execute on function public.capture_message_report_evidence_v2(uuid)
  to authenticated;
