-- Core V2 privacy and report initiation authority.
-- Privacy remains a versioned self aggregate. Reports are immutable submissions;
-- message content evidence remains owned by ConversationModerationProvider.

create or replace function private.player_privacy_snapshot_v2(
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  privacy_row public.player_privacy_settings_v2;
begin
  select privacy.* into privacy_row
  from public.player_privacy_settings_v2 privacy
  where privacy.player_id = p_player_id;

  if privacy_row.id is null then
    perform private.raise_core_error_v1(
      'privacy_forbidden',
      'The player privacy aggregate is unavailable.'
    );
  end if;

  return jsonb_build_object(
    'contractVersion', 2,
    'playerId', privacy_row.player_id,
    'version', privacy_row.version,
    'profileVisibility', privacy_row.profile_visibility,
    'presenceVisibility', privacy_row.presence_visibility,
    'friendshipRequests', privacy_row.friendship_requests,
    'sessionInvites', privacy_row.session_invites,
    'trustVisibility', privacy_row.trust_visibility,
    'updatedAt', privacy_row.updated_at
  );
end;
$$;

create or replace function private.write_social_entity_audit_v2(
  p_context jsonb,
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_event_ids jsonb,
  p_extra jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    (p_context ->> 'actorAccountId')::uuid,
    p_action,
    p_target_type,
    p_target_id,
    coalesce(p_context -> 'audit', '{}'::jsonb)
      || jsonb_build_object(
        'actorPlayerId', p_context ->> 'actorPlayerId',
        'correlationId', p_context ->> 'correlationId',
        'eventIds', coalesce(p_event_ids, '[]'::jsonb)
      )
      || coalesce(p_extra, '{}'::jsonb)
  );
$$;

create or replace function public.get_player_privacy_v2()
returns jsonb
language plpgsql
stable
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
  return private.player_privacy_snapshot_v2(actor_player_id);
end;
$$;

create or replace function public.update_player_privacy_v2(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'update_player_privacy_v2';
  preflight_command jsonb;
  command_context jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  expected_privacy_version_value bigint;
  profile_visibility_value text;
  presence_visibility_value text;
  friendship_requests_value text;
  session_invites_value text;
  trust_visibility_value text;
  privacy_row public.player_privacy_settings_v2;
  privacy_payload jsonb;
  event_id_value uuid;
  response_payload jsonb;
begin
  preflight_command := command || jsonb_build_object(
    'expectedRelationshipVersion', command -> 'expectedPrivacyVersion'
  );
  command_context := private.begin_social_command_v2(
    command_name,
    preflight_command
  );
  if (command_context ->> 'repeated')::boolean then
    return command_context -> 'response';
  end if;

  actor_account_id := (command_context ->> 'actorAccountId')::uuid;
  actor_player_id := (command_context ->> 'actorPlayerId')::uuid;
  expected_privacy_version_value :=
    (command_context ->> 'expectedRelationshipVersion')::bigint;
  profile_visibility_value := command ->> 'profileVisibility';
  presence_visibility_value := command ->> 'presenceVisibility';
  friendship_requests_value := command ->> 'friendshipRequests';
  session_invites_value := command ->> 'sessionInvites';
  trust_visibility_value := command ->> 'trustVisibility';

  if profile_visibility_value not in ('everyone', 'friends', 'private')
    or presence_visibility_value not in ('everyone', 'friends', 'hidden')
    or friendship_requests_value not in ('everyone', 'matched_only', 'nobody')
    or session_invites_value not in ('everyone', 'friends', 'nobody')
    or trust_visibility_value not in ('everyone', 'friends', 'private') then
    perform private.raise_core_error_v1(
      'validation_failed',
      'One or more privacy values are invalid.'
    );
  end if;

  select privacy.* into privacy_row
  from public.player_privacy_settings_v2 privacy
  where privacy.player_id = actor_player_id
  for update;
  if privacy_row.id is null then
    perform private.raise_core_error_v1(
      'privacy_forbidden',
      'The player privacy aggregate is unavailable.'
    );
  end if;
  if privacy_row.version <> expected_privacy_version_value then
    perform private.raise_core_error_v1(
      'privacy_version_conflict',
      'Privacy settings changed on another session. Reload before retrying.',
      false,
      jsonb_build_object(
        'actualVersion', privacy_row.version,
        'expectedVersion', expected_privacy_version_value,
        'playerId', actor_player_id
      )
    );
  end if;

  update public.player_privacy_settings_v2 privacy
  set profile_visibility = profile_visibility_value::public.profile_visibility_v2,
      presence_visibility = presence_visibility_value::public.presence_visibility_v2,
      friendship_requests = friendship_requests_value::public.friendship_request_policy_v2,
      session_invites = session_invites_value::public.session_invite_policy_v2,
      trust_visibility = trust_visibility_value::public.trust_visibility_v2,
      version = privacy.version + 1
  where privacy.id = privacy_row.id
  returning privacy.* into privacy_row;

  privacy_payload := private.player_privacy_snapshot_v2(actor_player_id);
  event_id_value := private.enqueue_contract_event_v2(
    'privacy.updated.v2',
    'player_privacy',
    actor_player_id,
    privacy_row.version,
    actor_player_id,
    (command_context ->> 'correlationId')::uuid,
    null,
    privacy_payload,
    format('privacy.updated.v2:%s:%s', actor_player_id, privacy_row.version)
  );

  response_payload := jsonb_build_object(
    'correlationId', command_context ->> 'correlationId',
    'eventIds', jsonb_build_array(event_id_value),
    'privacy', privacy_payload,
    'repeated', false
  );
  perform private.finish_command_v1(
    command_name,
    actor_account_id,
    command_context ->> 'idempotencyKey',
    response_payload
  );
  perform private.write_social_entity_audit_v2(
    command_context,
    'privacy.updated.v2',
    'player_privacy',
    actor_player_id,
    jsonb_build_array(event_id_value),
    jsonb_build_object('privacyVersion', privacy_row.version)
  );
  return response_payload;
end;
$$;

create or replace function private.validate_report_command_v2(
  p_command jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_value text := p_command ->> 'category';
  details_value text := nullif(btrim(p_command ->> 'details'), '');
  expected_report_version_value bigint;
begin
  begin
    expected_report_version_value := (p_command ->> 'expectedReportVersion')::bigint;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'expectedReportVersion must be zero for report submission.'
    );
  end;
  if expected_report_version_value is distinct from 0 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'expectedReportVersion must be zero for report submission.'
    );
  end if;
  if category_value not in (
    'harassment',
    'hate',
    'spam',
    'sexual_content',
    'threat',
    'cheating',
    'other'
  ) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Report category is invalid.'
    );
  end if;
  if details_value is not null and char_length(details_value) > 2000 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Report details must be at most 2000 characters.'
    );
  end if;

  return jsonb_build_object(
    'category', category_value,
    'details', details_value,
    'expectedReportVersion', expected_report_version_value
  );
end;
$$;

create or replace function private.finish_report_submission_v2(
  p_command_name text,
  p_command_context jsonb,
  p_report public.reports_v2,
  p_event_payload jsonb,
  p_evidence_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid;
  response_payload jsonb;
begin
  event_id_value := private.enqueue_contract_event_v2(
    'report.submitted.v2',
    'report',
    p_report.id,
    p_report.version,
    p_report.reporter_player_id,
    p_report.correlation_id,
    null,
    p_event_payload,
    format('report.submitted.v2:%s:%s', p_report.id, p_report.version)
  );
  response_payload := jsonb_build_object(
    'correlationId', p_command_context ->> 'correlationId',
    'eventIds', jsonb_build_array(event_id_value),
    'repeated', false,
    'reportId', p_report.id,
    'status', p_report.state,
    'version', p_report.version
  );
  perform private.finish_command_v1(
    p_command_name,
    (p_command_context ->> 'actorAccountId')::uuid,
    p_command_context ->> 'idempotencyKey',
    response_payload
  );
  perform private.write_social_entity_audit_v2(
    p_command_context,
    'report.submitted.v2',
    'report',
    p_report.id,
    jsonb_build_array(event_id_value),
    jsonb_build_object(
      'category', p_report.category,
      'reporterPlayerId', p_report.reporter_player_id,
      'targetKind', p_report.target_kind,
      'targetPlayerId', p_report.target_player_id
    ) || coalesce(p_evidence_metadata, '{}'::jsonb)
  );
  insert into private.social_authority_metrics_v2 (
    metric_name,
    actor_player_id,
    target_player_id,
    metadata
  ) values (
    'report_submission_completed',
    p_report.reporter_player_id,
    p_report.target_player_id,
    jsonb_build_object(
      'category', p_report.category,
      'reportId', p_report.id,
      'targetKind', p_report.target_kind
    )
  );
  return response_payload;
end;
$$;

create or replace function public.report_player_v2(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'report_player_v2';
  preflight_command jsonb;
  command_context jsonb;
  report_input jsonb;
  actor_player_id uuid;
  target_player_id_value uuid;
  report_row public.reports_v2;
  evidence_id_value uuid;
  event_payload jsonb;
begin
  preflight_command := command || jsonb_build_object(
    'expectedRelationshipVersion', command -> 'expectedReportVersion'
  );
  command_context := private.begin_social_command_v2(
    command_name,
    preflight_command
  );
  if (command_context ->> 'repeated')::boolean then
    return command_context -> 'response';
  end if;

  report_input := private.validate_report_command_v2(command);
  actor_player_id := (command_context ->> 'actorPlayerId')::uuid;
  begin
    target_player_id_value := (command ->> 'targetPlayerId')::uuid;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'targetPlayerId must be a valid canonical PlayerId.'
    );
  end;
  if actor_player_id = target_player_id_value then
    perform private.raise_core_error_v1(
      'report_self_forbidden',
      'A player cannot report self.'
    );
  end if;
  perform private.assert_social_target_v2(target_player_id_value, false, false);

  insert into public.reports_v2 (
    reporter_player_id,
    target_player_id,
    target_kind,
    category,
    details,
    state,
    version,
    correlation_id
  ) values (
    actor_player_id,
    target_player_id_value,
    'player',
    report_input ->> 'category',
    report_input ->> 'details',
    'submitted',
    1,
    (command_context ->> 'correlationId')::uuid
  ) returning * into report_row;

  insert into public.report_evidence_v2 (
    report_id,
    evidence_kind,
    payload
  ) values (
    report_row.id,
    'client_context',
    jsonb_build_object(
      'audit', command_context -> 'audit',
      'category', report_row.category,
      'targetPlayerId', target_player_id_value
    )
  ) returning id into evidence_id_value;

  event_payload := jsonb_build_object(
    'category', report_row.category,
    'conversationId', null,
    'messageId', null,
    'reportId', report_row.id,
    'reporterPlayerId', actor_player_id,
    'targetPlayerId', target_player_id_value
  );
  return private.finish_report_submission_v2(
    command_name,
    command_context,
    report_row,
    event_payload,
    jsonb_build_object('evidenceId', evidence_id_value)
  );
end;
$$;

create or replace function public.report_message_v2(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'report_message_v2';
  preflight_command jsonb;
  command_context jsonb;
  report_input jsonb;
  actor_player_id uuid;
  target_player_id_value uuid;
  conversation_id_value uuid;
  message_id_value uuid;
  message_row public.messages;
  report_row public.reports_v2;
  evidence_id_value uuid;
  content_fingerprint_value text;
  event_payload jsonb;
begin
  preflight_command := command || jsonb_build_object(
    'expectedRelationshipVersion', command -> 'expectedReportVersion'
  );
  command_context := private.begin_social_command_v2(
    command_name,
    preflight_command
  );
  if (command_context ->> 'repeated')::boolean then
    return command_context -> 'response';
  end if;

  report_input := private.validate_report_command_v2(command);
  actor_player_id := (command_context ->> 'actorPlayerId')::uuid;
  begin
    target_player_id_value := (command ->> 'targetPlayerId')::uuid;
    conversation_id_value := (command ->> 'conversationId')::uuid;
    message_id_value := (command ->> 'messageId')::uuid;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'targetPlayerId, conversationId and messageId must be valid UUIDs.'
    );
  end;
  if actor_player_id = target_player_id_value then
    perform private.raise_core_error_v1(
      'report_self_forbidden',
      'A player cannot report own message.'
    );
  end if;
  perform private.assert_social_target_v2(target_player_id_value, false, false);

  if not private.is_conversation_player_member_v1(
    conversation_id_value,
    actor_player_id
  ) then
    perform private.raise_core_error_v1(
      'report_evidence_invalid',
      'Only a current or historical conversation member may report a message.'
    );
  end if;

  select messages.* into message_row
  from public.messages messages
  where messages.id = message_id_value
    and messages.conversation_id = conversation_id_value
    and messages.schema_version_v1 = 1;
  if message_row.id is null then
    perform private.raise_core_error_v1(
      'report_target_not_found',
      'The authoritative conversation message does not exist.'
    );
  end if;
  if message_row.sender_player_id_v1 is distinct from target_player_id_value then
    perform private.raise_core_error_v1(
      'report_evidence_invalid',
      'The reported player is not the authoritative message sender.'
    );
  end if;

  content_fingerprint_value := private.command_request_hash_v1(
    coalesce(message_row.content_v1, '{}'::jsonb)
  );
  insert into public.reports_v2 (
    reporter_player_id,
    target_player_id,
    target_kind,
    category,
    details,
    conversation_id,
    message_id,
    state,
    version,
    correlation_id
  ) values (
    actor_player_id,
    target_player_id_value,
    'message',
    report_input ->> 'category',
    report_input ->> 'details',
    conversation_id_value,
    message_id_value,
    'submitted',
    1,
    (command_context ->> 'correlationId')::uuid
  ) returning * into report_row;

  insert into public.report_evidence_v2 (
    report_id,
    evidence_kind,
    payload
  ) values (
    report_row.id,
    'message_reference',
    jsonb_build_object(
      'contentFingerprint', content_fingerprint_value,
      'contentKind', message_row.content_kind_v1,
      'conversationId', conversation_id_value,
      'messageCreatedAt', message_row.created_at,
      'messageId', message_id_value,
      'messageTombstonedAt', message_row.deleted_at,
      'senderPlayerId', message_row.sender_player_id_v1,
      'sequence', message_row.sequence_v1
    )
  ) returning id into evidence_id_value;

  event_payload := jsonb_build_object(
    'category', report_row.category,
    'conversationId', conversation_id_value,
    'messageId', message_id_value,
    'reportId', report_row.id,
    'reporterPlayerId', actor_player_id,
    'targetPlayerId', target_player_id_value
  );
  return private.finish_report_submission_v2(
    command_name,
    command_context,
    report_row,
    event_payload,
    jsonb_build_object(
      'conversationId', conversation_id_value,
      'evidenceId', evidence_id_value,
      'messageId', message_id_value
    )
  );
end;
$$;

revoke execute on function private.player_privacy_snapshot_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.write_social_entity_audit_v2(
  jsonb,
  text,
  text,
  uuid,
  jsonb,
  jsonb
) from public, anon, authenticated;
revoke execute on function private.validate_report_command_v2(jsonb)
  from public, anon, authenticated;
revoke execute on function private.finish_report_submission_v2(
  text,
  jsonb,
  public.reports_v2,
  jsonb,
  jsonb
) from public, anon, authenticated;
revoke execute on function public.get_player_privacy_v2()
  from public, anon;
revoke execute on function public.update_player_privacy_v2(jsonb)
  from public, anon;
revoke execute on function public.report_player_v2(jsonb)
  from public, anon;
revoke execute on function public.report_message_v2(jsonb)
  from public, anon;

grant execute on function public.get_player_privacy_v2()
  to authenticated;
grant execute on function public.update_player_privacy_v2(jsonb)
  to authenticated;
grant execute on function public.report_player_v2(jsonb)
  to authenticated;
grant execute on function public.report_message_v2(jsonb)
  to authenticated;
