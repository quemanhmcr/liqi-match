-- Align report evidence delivery with the strict Core V2 DTO. Evidence remains
-- immutable and idempotent by report_id; the response contains no transport-only
-- replay flag or content fingerprint.

create or replace function public.capture_message_report_evidence_v2(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  actor_player_id uuid;
  report public.reports_v2%rowtype;
  message public.messages_v2%rowtype;
  evidence public.message_report_evidence_v2%rowtype;
begin
  actor := private.resolve_social_actor_v2(false, false);
  actor_player_id := (actor ->> 'playerId')::uuid;

  select reports.*
  into report
  from public.reports_v2 reports
  where reports.id = p_report_id;

  if report.id is null or report.target_kind <> 'message' then
    perform private.raise_core_error_v1(
      'report_target_not_found',
      'Message report was not found.'
    );
  end if;
  if report.reporter_player_id <> actor_player_id then
    perform private.raise_core_error_v1(
      'report_evidence_invalid',
      'Only the reporter may capture message evidence.'
    );
  end if;

  select evidence_rows.*
  into evidence
  from public.message_report_evidence_v2 evidence_rows
  where evidence_rows.report_id = report.id;

  if evidence.id is null then
    if report.conversation_v2_id is null or report.message_v2_id is null then
      perform private.raise_core_error_v1(
        'report_evidence_invalid',
        'Legacy message evidence is owned by the V1 compatibility path.'
      );
    end if;
    if not exists (
      select 1
      from public.conversation_members_v2 members
      where members.conversation_id = report.conversation_v2_id
        and members.player_id = actor_player_id
    ) then
      perform private.raise_core_error_v1(
        'report_evidence_invalid',
        'Only a current or historical conversation member may capture evidence.'
      );
    end if;

    select messages.*
    into message
    from public.messages_v2 messages
    where messages.id = report.message_v2_id
      and messages.conversation_id = report.conversation_v2_id;
    if message.id is null then
      perform private.raise_core_error_v1(
        'report_target_not_found',
        'The V2 message was not found.'
      );
    end if;

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
    ) values (
      report.id,
      message.conversation_id,
      message.id,
      actor_player_id,
      message.sender_player_id,
      message.sequence,
      message.kind,
      message.content,
      message.content_fingerprint,
      message.created_at,
      message.tombstoned_at
    )
    on conflict (report_id) do nothing;

    select evidence_rows.*
    into evidence
    from public.message_report_evidence_v2 evidence_rows
    where evidence_rows.report_id = report.id;
  end if;

  select messages.*
  into message
  from public.messages_v2 messages
  where messages.id = evidence.message_id
    and messages.conversation_id = evidence.conversation_id;
  if message.id is null then
    perform private.raise_core_error_v1(
      'report_target_not_found',
      'The captured V2 message was not found.'
    );
  end if;

  return jsonb_build_object(
    'evidenceId', evidence.id,
    'conversationId', evidence.conversation_id,
    'message', jsonb_build_object(
      'messageId', evidence.message_id,
      'conversationId', evidence.conversation_id,
      'senderPlayerId', evidence.sender_player_id,
      'clientMessageId', message.client_message_id,
      'sequence', evidence.message_sequence,
      'content', evidence.content_snapshot,
      'createdAt', evidence.message_created_at,
      'tombstonedAt', evidence.message_tombstoned_at
    ),
    'reporterPlayerId', evidence.reporter_player_id,
    'capturedAt', evidence.captured_at
  );
end;
$$;

revoke execute on function public.capture_message_report_evidence_v2(uuid)
  from public, anon;
grant execute on function public.capture_message_report_evidence_v2(uuid)
  to authenticated, service_role;
