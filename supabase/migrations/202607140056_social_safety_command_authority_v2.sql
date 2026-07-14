-- Core V2 block and mute command authority.
-- Canonical rows are PlayerId-based. Legacy profile blocks are dual-written only
-- during the shadow cutover so V1 consumers continue to fail closed.

create or replace function private.legacy_profile_id_for_player_v2(
  p_player_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select profiles.legacy_profile_id
  from public.player_profiles_v1 profiles
  where profiles.player_id = p_player_id;
$$;

create or replace function public.block_player_v2(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'block_player_v2';
  command_context jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  target_player_id_value uuid;
  expected_relationship_version_value bigint;
  reason_code_value text := nullif(btrim(command ->> 'reasonCode'), '');
  relationship_row public.social_relationships_v2;
  block_row public.player_blocks_v2;
  actor_legacy_profile_id uuid;
  target_legacy_profile_id uuid;
  cancelled_request_count integer := 0;
  event_id_value uuid;
  response_payload jsonb;
begin
  command_context := private.begin_social_command_v2(command_name, command);
  if (command_context ->> 'repeated')::boolean then
    return command_context -> 'response';
  end if;

  actor_account_id := (command_context ->> 'actorAccountId')::uuid;
  actor_player_id := (command_context ->> 'actorPlayerId')::uuid;
  expected_relationship_version_value :=
    (command_context ->> 'expectedRelationshipVersion')::bigint;
  begin
    target_player_id_value := (command ->> 'targetPlayerId')::uuid;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'targetPlayerId must be a valid canonical PlayerId.'
    );
  end;
  if reason_code_value is not null and char_length(reason_code_value) > 64 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'reasonCode must be at most 64 characters.'
    );
  end if;

  perform private.assert_social_target_v2(target_player_id_value, false, true);
  relationship_row := private.ensure_social_relationship_v2(
    actor_player_id,
    target_player_id_value
  );
  perform private.assert_social_relationship_version_v2(
    relationship_row,
    expected_relationship_version_value
  );

  select blocks.* into block_row
  from public.player_blocks_v2 blocks
  where blocks.blocker_player_id = actor_player_id
    and blocks.blocked_player_id = target_player_id_value
  for update;
  if block_row.active then
    perform private.raise_core_error_v1(
      'block_already_active',
      'The target player is already blocked.',
      false,
      jsonb_build_object(
        'blockVersion', block_row.version,
        'relationshipId', relationship_row.id
      )
    );
  end if;

  if block_row.id is null then
    insert into public.player_blocks_v2 (
      relationship_id,
      blocker_player_id,
      blocked_player_id,
      active,
      version,
      reason_code,
      blocked_at,
      unblocked_at
    ) values (
      relationship_row.id,
      actor_player_id,
      target_player_id_value,
      true,
      1,
      reason_code_value,
      now(),
      null
    ) returning * into block_row;
  else
    update public.player_blocks_v2 blocks
    set active = true,
        version = blocks.version + 1,
        reason_code = reason_code_value,
        blocked_at = now(),
        unblocked_at = null
    where blocks.id = block_row.id
    returning blocks.* into block_row;
  end if;

  update public.friendship_requests_v2 requests
  set state = 'cancelled',
      version = requests.version + 1,
      responded_at = now()
  where requests.relationship_id = relationship_row.id
    and requests.state = 'pending';
  get diagnostics cancelled_request_count = row_count;

  update public.social_relationships_v2 relationships
  set friendship_state = case relationships.friendship_state
        when 'accepted' then 'removed'::public.friendship_state_v2
        when 'pending' then 'none'::public.friendship_state_v2
        else relationships.friendship_state
      end,
      removed_at = case
        when relationships.friendship_state = 'accepted' then now()
        else relationships.removed_at
      end,
      version = relationships.version + 1
  where relationships.id = relationship_row.id
  returning relationships.* into relationship_row;

  actor_legacy_profile_id := private.legacy_profile_id_for_player_v2(actor_player_id);
  target_legacy_profile_id := private.legacy_profile_id_for_player_v2(
    target_player_id_value
  );
  if actor_legacy_profile_id is not null and target_legacy_profile_id is not null then
    insert into public.blocks (blocker_id, blocked_id, reason)
    values (actor_legacy_profile_id, target_legacy_profile_id, reason_code_value)
    on conflict (blocker_id, blocked_id) do update
      set reason = excluded.reason;
    insert into private.social_authority_metrics_v2 (
      metric_name,
      relationship_id,
      actor_player_id,
      target_player_id,
      metadata
    ) values (
      'legacy_block_dual_write',
      relationship_row.id,
      actor_player_id,
      target_player_id_value,
      jsonb_build_object('operation', 'block')
    );
  else
    insert into private.social_authority_metrics_v2 (
      metric_name,
      relationship_id,
      actor_player_id,
      target_player_id,
      metadata
    ) values (
      'legacy_block_mapping_missing',
      relationship_row.id,
      actor_player_id,
      target_player_id_value,
      jsonb_build_object('operation', 'block')
    );
  end if;

  event_id_value := private.enqueue_contract_event_v2(
    'player.blocked.v2',
    'social_relationship',
    relationship_row.id,
    relationship_row.version,
    actor_player_id,
    (command_context ->> 'correlationId')::uuid,
    null,
    jsonb_build_object(
      'blockedPlayerId', target_player_id_value,
      'blockerPlayerId', actor_player_id,
      'reasonCode', reason_code_value
    ),
    format(
      'player.blocked.v2:%s:%s:%s',
      relationship_row.id,
      actor_player_id,
      relationship_row.version
    )
  );

  response_payload := jsonb_build_object(
    'correlationId', command_context ->> 'correlationId',
    'eventIds', jsonb_build_array(event_id_value),
    'relationship', private.social_relationship_snapshot_v2(
      actor_player_id,
      target_player_id_value
    ),
    'repeated', false
  );
  perform private.finish_command_v1(
    command_name,
    actor_account_id,
    command_context ->> 'idempotencyKey',
    response_payload
  );
  perform private.write_social_command_audit_v2(
    command_context,
    'player.blocked.v2',
    relationship_row.id,
    target_player_id_value,
    jsonb_build_array(event_id_value),
    jsonb_build_object(
      'blockVersion', block_row.version,
      'cancelledRequestCount', cancelled_request_count,
      'reasonCode', reason_code_value,
      'relationshipVersion', relationship_row.version
    )
  );
  return response_payload;
end;
$$;

create or replace function public.unblock_player_v2(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_name constant text := 'unblock_player_v2';
  command_context jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  target_player_id_value uuid;
  expected_relationship_version_value bigint;
  relationship_row public.social_relationships_v2;
  block_row public.player_blocks_v2;
  actor_legacy_profile_id uuid;
  target_legacy_profile_id uuid;
  event_id_value uuid;
  response_payload jsonb;
begin
  command_context := private.begin_social_command_v2(command_name, command);
  if (command_context ->> 'repeated')::boolean then
    return command_context -> 'response';
  end if;

  actor_account_id := (command_context ->> 'actorAccountId')::uuid;
  actor_player_id := (command_context ->> 'actorPlayerId')::uuid;
  expected_relationship_version_value :=
    (command_context ->> 'expectedRelationshipVersion')::bigint;
  begin
    target_player_id_value := (command ->> 'targetPlayerId')::uuid;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'targetPlayerId must be a valid canonical PlayerId.'
    );
  end;
  perform private.assert_social_target_v2(target_player_id_value, false, true);

  select relationships.* into relationship_row
  from public.social_relationships_v2 relationships
  where relationships.player_low_id = least(actor_player_id, target_player_id_value)
    and relationships.player_high_id = greatest(actor_player_id, target_player_id_value)
  for update;
  if relationship_row.id is null then
    perform private.raise_core_error_v1(
      'block_not_found',
      'No active block exists for the target player.'
    );
  end if;
  perform private.assert_social_relationship_version_v2(
    relationship_row,
    expected_relationship_version_value
  );

  select blocks.* into block_row
  from public.player_blocks_v2 blocks
  where blocks.blocker_player_id = actor_player_id
    and blocks.blocked_player_id = target_player_id_value
  for update;
  if block_row.id is null or not block_row.active then
    perform private.raise_core_error_v1(
      'block_not_found',
      'No active block exists for the target player.'
    );
  end if;

  update public.player_blocks_v2 blocks
  set active = false,
      version = blocks.version + 1,
      unblocked_at = now()
  where blocks.id = block_row.id
  returning blocks.* into block_row;
  update public.social_relationships_v2 relationships
  set version = relationships.version + 1
  where relationships.id = relationship_row.id
  returning relationships.* into relationship_row;

  actor_legacy_profile_id := private.legacy_profile_id_for_player_v2(actor_player_id);
  target_legacy_profile_id := private.legacy_profile_id_for_player_v2(
    target_player_id_value
  );
  if actor_legacy_profile_id is not null and target_legacy_profile_id is not null then
    delete from public.blocks legacy_blocks
    where legacy_blocks.blocker_id = actor_legacy_profile_id
      and legacy_blocks.blocked_id = target_legacy_profile_id;
    insert into private.social_authority_metrics_v2 (
      metric_name,
      relationship_id,
      actor_player_id,
      target_player_id,
      metadata
    ) values (
      'legacy_block_dual_write',
      relationship_row.id,
      actor_player_id,
      target_player_id_value,
      jsonb_build_object('operation', 'unblock')
    );
  end if;

  event_id_value := private.enqueue_contract_event_v2(
    'player.unblocked.v2',
    'social_relationship',
    relationship_row.id,
    relationship_row.version,
    actor_player_id,
    (command_context ->> 'correlationId')::uuid,
    null,
    jsonb_build_object(
      'blockedPlayerId', target_player_id_value,
      'blockerPlayerId', actor_player_id,
      'friendshipRestored', false
    ),
    format(
      'player.unblocked.v2:%s:%s:%s',
      relationship_row.id,
      actor_player_id,
      relationship_row.version
    )
  );

  response_payload := jsonb_build_object(
    'correlationId', command_context ->> 'correlationId',
    'eventIds', jsonb_build_array(event_id_value),
    'relationship', private.social_relationship_snapshot_v2(
      actor_player_id,
      target_player_id_value
    ),
    'repeated', false
  );
  perform private.finish_command_v1(
    command_name,
    actor_account_id,
    command_context ->> 'idempotencyKey',
    response_payload
  );
  perform private.write_social_command_audit_v2(
    command_context,
    'player.unblocked.v2',
    relationship_row.id,
    target_player_id_value,
    jsonb_build_array(event_id_value),
    jsonb_build_object(
      'blockVersion', block_row.version,
      'friendshipRestored', false,
      'relationshipVersion', relationship_row.version
    )
  );
  return response_payload;
end;
$$;

create or replace function private.execute_player_mute_transition_v2(
  p_command_name text,
  p_activate boolean,
  p_command jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_context jsonb;
  actor_account_id uuid;
  actor_player_id uuid;
  target_player_id_value uuid;
  expected_relationship_version_value bigint;
  relationship_row public.social_relationships_v2;
  mute_row public.player_mutes_v2;
  event_id_value uuid;
  event_type_value text;
  response_payload jsonb;
begin
  command_context := private.begin_social_command_v2(p_command_name, p_command);
  if (command_context ->> 'repeated')::boolean then
    return command_context -> 'response';
  end if;

  actor_account_id := (command_context ->> 'actorAccountId')::uuid;
  actor_player_id := (command_context ->> 'actorPlayerId')::uuid;
  expected_relationship_version_value :=
    (command_context ->> 'expectedRelationshipVersion')::bigint;
  begin
    target_player_id_value := (p_command ->> 'targetPlayerId')::uuid;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'targetPlayerId must be a valid canonical PlayerId.'
    );
  end;
  perform private.assert_social_target_v2(target_player_id_value, false, true);

  relationship_row := private.ensure_social_relationship_v2(
    actor_player_id,
    target_player_id_value
  );
  perform private.assert_social_relationship_version_v2(
    relationship_row,
    expected_relationship_version_value
  );
  if private.are_players_blocked_v2(actor_player_id, target_player_id_value) then
    perform private.raise_core_error_v1(
      'relationship_blocked',
      'Mute preference cannot change while either player is blocked.'
    );
  end if;

  select mutes.* into mute_row
  from public.player_mutes_v2 mutes
  where mutes.muter_player_id = actor_player_id
    and mutes.muted_player_id = target_player_id_value
  for update;

  if p_activate and mute_row.active then
    perform private.raise_core_error_v1(
      'mute_already_active',
      'The target player is already muted.'
    );
  end if;
  if not p_activate and (mute_row.id is null or not mute_row.active) then
    perform private.raise_core_error_v1(
      'mute_not_found',
      'No active mute exists for the target player.'
    );
  end if;

  if p_activate and mute_row.id is null then
    insert into public.player_mutes_v2 (
      relationship_id,
      muter_player_id,
      muted_player_id,
      active,
      version,
      muted_at,
      unmuted_at
    ) values (
      relationship_row.id,
      actor_player_id,
      target_player_id_value,
      true,
      1,
      now(),
      null
    ) returning * into mute_row;
  elsif p_activate then
    update public.player_mutes_v2 mutes
    set active = true,
        version = mutes.version + 1,
        muted_at = now(),
        unmuted_at = null
    where mutes.id = mute_row.id
    returning mutes.* into mute_row;
  else
    update public.player_mutes_v2 mutes
    set active = false,
        version = mutes.version + 1,
        unmuted_at = now()
    where mutes.id = mute_row.id
    returning mutes.* into mute_row;
  end if;

  update public.social_relationships_v2 relationships
  set version = relationships.version + 1
  where relationships.id = relationship_row.id
  returning relationships.* into relationship_row;

  event_type_value := case
    when p_activate then 'player.muted.v2'
    else 'player.unmuted.v2'
  end;
  event_id_value := private.enqueue_contract_event_v2(
    event_type_value,
    'social_relationship',
    relationship_row.id,
    relationship_row.version,
    actor_player_id,
    (command_context ->> 'correlationId')::uuid,
    null,
    jsonb_build_object(
      'mutedPlayerId', target_player_id_value,
      'muterPlayerId', actor_player_id
    ),
    format(
      '%s:%s:%s:%s',
      event_type_value,
      relationship_row.id,
      actor_player_id,
      relationship_row.version
    )
  );

  response_payload := jsonb_build_object(
    'correlationId', command_context ->> 'correlationId',
    'eventIds', jsonb_build_array(event_id_value),
    'relationship', private.social_relationship_snapshot_v2(
      actor_player_id,
      target_player_id_value
    ),
    'repeated', false
  );
  perform private.finish_command_v1(
    p_command_name,
    actor_account_id,
    command_context ->> 'idempotencyKey',
    response_payload
  );
  perform private.write_social_command_audit_v2(
    command_context,
    event_type_value,
    relationship_row.id,
    target_player_id_value,
    jsonb_build_array(event_id_value),
    jsonb_build_object(
      'muteVersion', mute_row.version,
      'relationshipVersion', relationship_row.version
    )
  );
  return response_payload;
end;
$$;

create or replace function public.mute_player_v2(command jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.execute_player_mute_transition_v2(
    'mute_player_v2',
    true,
    command
  );
$$;

create or replace function public.unmute_player_v2(command jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.execute_player_mute_transition_v2(
    'unmute_player_v2',
    false,
    command
  );
$$;

revoke execute on function private.legacy_profile_id_for_player_v2(uuid)
  from public, anon, authenticated;
revoke execute on function private.execute_player_mute_transition_v2(
  text,
  boolean,
  jsonb
) from public, anon, authenticated;
revoke execute on function public.block_player_v2(jsonb)
  from public, anon;
revoke execute on function public.unblock_player_v2(jsonb)
  from public, anon;
revoke execute on function public.mute_player_v2(jsonb)
  from public, anon;
revoke execute on function public.unmute_player_v2(jsonb)
  from public, anon;

grant execute on function public.block_player_v2(jsonb)
  to authenticated;
grant execute on function public.unblock_player_v2(jsonb)
  to authenticated;
grant execute on function public.mute_player_v2(jsonb)
  to authenticated;
grant execute on function public.unmute_player_v2(jsonb)
  to authenticated;
