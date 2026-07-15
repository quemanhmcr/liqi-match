-- PostgreSQL treats casts from JSON null/missing text as SQL NULL.
-- Replace the Session Social consumer so required event-envelope facts fail
-- closed before any three-valued equality checks or consumed-event receipt.

create or replace function private.consume_play_session_social_event_v2(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id_value uuid;
  aggregate_id_value uuid;
  aggregate_version_value bigint;
  actor_player_id_value uuid;
  correlation_id_value uuid;
  blocker_player_id_value uuid;
  blocked_player_id_value uuid;
  occurred_at_value timestamptz;
  reason_code_value text;
  payload_fingerprint_value text;
  authoritative_event jsonb;
  consumed_row private.play_session_consumed_social_events_v2%rowtype;
  session_id_value uuid;
  session_row public.play_sessions_v2%rowtype;
  removed_player_id_value uuid;
  member_event_id_value uuid;
  invite_event_id_value uuid;
  invite_row public.play_session_invites_v2%rowtype;
  cancelled_invite_ids uuid[];
  cancelled_target_ids uuid[];
  cancelled_invite_count integer;
  invite_index integer;
  both_players_active boolean;
  action_value text;
  action_event_id_value uuid;
  actions_value jsonb := '[]'::jsonb;
  response_value jsonb;
begin
  perform private.assert_play_session_social_worker_v2();

  if jsonb_typeof(p_event) <> 'object'
    or p_event ->> 'eventType' <> 'player.blocked.v2'
    or coalesce((p_event ->> 'eventVersion')::integer, 0) <> 2
    or p_event ->> 'aggregateType' <> 'social_relationship' then
    perform private.raise_core_error_v1(
      'unsupported_event_version',
      'Only player.blocked.v2 event version 2 is supported.'
    );
  end if;

  begin
    event_id_value := (p_event ->> 'eventId')::uuid;
    aggregate_id_value := (p_event ->> 'aggregateId')::uuid;
    aggregate_version_value := (p_event ->> 'aggregateVersion')::bigint;
    actor_player_id_value := (p_event ->> 'actorPlayerId')::uuid;
    correlation_id_value := (p_event ->> 'correlationId')::uuid;
    blocker_player_id_value := (p_event #>> '{payload,blockerPlayerId}')::uuid;
    blocked_player_id_value := (p_event #>> '{payload,blockedPlayerId}')::uuid;
    occurred_at_value := (p_event ->> 'occurredAt')::timestamptz;
  exception when others then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Session social-event envelope is invalid.'
    );
  end;

  if event_id_value is null
    or aggregate_id_value is null
    or aggregate_version_value is null
    or actor_player_id_value is null
    or correlation_id_value is null
    or blocker_player_id_value is null
    or blocked_player_id_value is null
    or occurred_at_value is null then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Session social-event envelope is incomplete.'
    );
  end if;

  if blocker_player_id_value = blocked_player_id_value
    or aggregate_version_value <= 0
    or actor_player_id_value <> blocker_player_id_value
    or aggregate_id_value <> private.social_relationship_id_v2(
      blocker_player_id_value,
      blocked_player_id_value
    ) then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Session social-event facts do not match Social authority.'
    );
  end if;

  select events.payload
  into authoritative_event
  from private.outbox_events events
  where events.id = event_id_value
    and events.event_type = 'player.blocked.v2'
    and events.contract_version = 2
  for update;
  if authoritative_event is null or authoritative_event is distinct from p_event then
    perform private.raise_core_error_v1(
      'event_replay_conflict',
      'Social eventId is not bound to the supplied authoritative facts.'
    );
  end if;

  reason_code_value := coalesce(
    nullif(p_event #>> '{payload,reasonCode}', ''),
    'relationship_blocked'
  );
  payload_fingerprint_value := private.command_request_hash_v1(p_event);

  select consumed.* into consumed_row
  from private.play_session_consumed_social_events_v2 consumed
  where consumed.event_id = event_id_value
  for update;
  if consumed_row.event_id is not null then
    if consumed_row.payload_fingerprint is distinct from payload_fingerprint_value then
      perform private.raise_core_error_v1(
        'event_replay_conflict',
        'Social eventId is bound to different facts.'
      );
    end if;
    return jsonb_set(consumed_row.response, '{repeated}', 'true'::jsonb, true);
  end if;

  for session_id_value in
    select candidates.session_id
    from (
      select sessions.id as session_id
      from public.play_sessions_v2 sessions
      where exists (
        select 1
        from public.play_session_members_v2 blocker
        where blocker.session_id = sessions.id
          and blocker.player_id = blocker_player_id_value
          and blocker.state = 'active'
      )
        and exists (
          select 1
          from public.play_session_members_v2 blocked
          where blocked.session_id = sessions.id
            and blocked.player_id = blocked_player_id_value
            and blocked.state = 'active'
        )
      union
      select invites.session_id
      from public.play_session_invites_v2 invites
      where invites.state = 'pending'
        and (
          (
            invites.inviter_player_id = blocker_player_id_value
            and invites.target_player_id = blocked_player_id_value
          )
          or (
            invites.inviter_player_id = blocked_player_id_value
            and invites.target_player_id = blocker_player_id_value
          )
        )
    ) candidates
    order by candidates.session_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('play-session:' || session_id_value::text, 0)
    );
    select sessions.* into session_row
    from public.play_sessions_v2 sessions
    where sessions.id = session_id_value
    for update;
    if session_row.id is null then
      continue;
    end if;

    cancelled_invite_ids := '{}'::uuid[];
    cancelled_target_ids := '{}'::uuid[];
    cancelled_invite_count := 0;
    for invite_row in
      select invites.*
      from public.play_session_invites_v2 invites
      where invites.session_id = session_id_value
        and invites.state = 'pending'
        and (
          (
            invites.inviter_player_id = blocker_player_id_value
            and invites.target_player_id = blocked_player_id_value
          )
          or (
            invites.inviter_player_id = blocked_player_id_value
            and invites.target_player_id = blocker_player_id_value
          )
        )
      order by invites.id
      for update
    loop
      update public.play_session_invites_v2 invites
      set state = 'cancelled',
          version = invites.version + 1,
          responded_at = occurred_at_value,
          updated_at = occurred_at_value
      where invites.id = invite_row.id;
      cancelled_invite_ids := array_append(cancelled_invite_ids, invite_row.id);
      cancelled_target_ids := array_append(
        cancelled_target_ids,
        invite_row.target_player_id
      );
      cancelled_invite_count := cancelled_invite_count + 1;
    end loop;

    select
      exists (
        select 1
        from public.play_session_members_v2 members
        where members.session_id = session_id_value
          and members.player_id = blocker_player_id_value
          and members.state = 'active'
      ) and exists (
        select 1
        from public.play_session_members_v2 members
        where members.session_id = session_id_value
          and members.player_id = blocked_player_id_value
          and members.state = 'active'
      )
    into both_players_active;

    action_value := 'no_change';
    action_event_id_value := null;

    if both_players_active
      and session_row.state in ('in_progress', 'completion_pending') then
      update public.play_sessions_v2 sessions
      set state = 'disputed',
          version = sessions.version + 1,
          updated_at = occurred_at_value
      where sessions.id = session_id_value
      returning sessions.* into session_row;

      insert into private.play_session_social_visibility_revocations_v2 (
        session_id,
        player_id,
        source_event_id,
        reason_code,
        revoked_at
      ) values
        (
          session_id_value,
          blocker_player_id_value,
          event_id_value,
          reason_code_value,
          occurred_at_value
        ),
        (
          session_id_value,
          blocked_player_id_value,
          event_id_value,
          reason_code_value,
          occurred_at_value
        )
      on conflict (session_id, player_id) do nothing;

      member_event_id_value := private.enqueue_contract_event_v2(
        'session.safety_disputed.v2',
        'play_session',
        session_id_value,
        session_row.version,
        blocker_player_id_value,
        correlation_id_value,
        event_id_value,
        jsonb_build_object(
          'blockedPlayerId', blocked_player_id_value,
          'blockerPlayerId', blocker_player_id_value,
          'reasonCode', reason_code_value,
          'sessionId', session_id_value,
          'sourceSocialEventId', event_id_value
        ),
        format('session-safety-disputed:%s:%s', event_id_value, session_id_value)
      );
      action_value := 'session_disputed';
      action_event_id_value := member_event_id_value;
    elsif both_players_active
      and session_row.state in ('draft', 'recruiting', 'ready_check', 'scheduled') then
      removed_player_id_value := case
        when blocked_player_id_value = session_row.owner_player_id
          then blocker_player_id_value
        else blocked_player_id_value
      end;

      if removed_player_id_value <> session_row.owner_player_id then
        perform private.cancel_open_ready_check_for_membership_v2(session_id_value);
        update public.play_session_members_v2 members
        set state = 'removed',
            left_at = occurred_at_value,
            reason_code = 'relationship_blocked',
            updated_at = occurred_at_value
        where members.session_id = session_id_value
          and members.player_id = removed_player_id_value
          and members.state = 'active';

        if found then
          update public.play_session_role_assignments_v2 assignments
          set active = false,
              version = assignments.version + 1,
              revoked_at = occurred_at_value
          where assignments.session_id = session_id_value
            and assignments.player_id = removed_player_id_value
            and assignments.active;

          update public.play_sessions_v2 sessions
          set state = 'recruiting',
              version = sessions.version + 1,
              membership_version = sessions.membership_version + 1,
              updated_at = occurred_at_value
          where sessions.id = session_id_value
          returning sessions.* into session_row;

          insert into private.play_session_social_visibility_revocations_v2 (
            session_id,
            player_id,
            source_event_id,
            reason_code,
            revoked_at
          ) values (
            session_id_value,
            removed_player_id_value,
            event_id_value,
            reason_code_value,
            occurred_at_value
          )
          on conflict (session_id, player_id) do nothing;

          member_event_id_value := private.enqueue_contract_event_v2(
            'session.member_left.v2',
            'play_session',
            session_id_value,
            session_row.version,
            blocker_player_id_value,
            correlation_id_value,
            event_id_value,
            jsonb_build_object(
              'memberPlayerId', removed_player_id_value,
              'membership', private.play_session_membership_snapshot_v2(session_id_value),
              'reasonCode', 'relationship_blocked',
              'sessionId', session_id_value
            ),
            format('session-block-member-left:%s:%s', event_id_value, session_id_value)
          );
          action_value := 'member_removed';
          action_event_id_value := member_event_id_value;
        end if;
      end if;
    end if;

    if cancelled_invite_count > 0 and action_value = 'no_change' then
      update public.play_sessions_v2 sessions
      set version = sessions.version + 1,
          updated_at = occurred_at_value
      where sessions.id = session_id_value
      returning sessions.* into session_row;
      action_value := 'invite_cancelled';
    end if;

    if cancelled_invite_count > 0 then
      for invite_index in 1..cancelled_invite_count loop
        invite_event_id_value := private.enqueue_contract_event_v2(
          'session.invite_cancelled.v2',
          'play_session',
          session_id_value,
          session_row.version,
          blocker_player_id_value,
          correlation_id_value,
          event_id_value,
          jsonb_build_object(
            'inviteId', cancelled_invite_ids[invite_index],
            'reasonCode', 'relationship_blocked',
            'sessionId', session_id_value,
            'sourceSocialEventId', event_id_value,
            'targetPlayerId', cancelled_target_ids[invite_index]
          ),
          format(
            'session-block-invite-cancelled:%s:%s',
            event_id_value,
            cancelled_invite_ids[invite_index]
          )
        );
        if action_event_id_value is null then
          action_event_id_value := invite_event_id_value;
        end if;
      end loop;
    end if;

    actions_value := actions_value || jsonb_build_array(
      jsonb_build_object(
        'action', action_value,
        'eventId', action_event_id_value,
        'membershipVersion', session_row.membership_version,
        'sessionId', session_id_value,
        'sessionVersion', session_row.version
      ) || case
        when cancelled_invite_count > 0
          then jsonb_build_object('cancelledInviteCount', cancelled_invite_count)
        else '{}'::jsonb
      end
    );
  end loop;

  response_value := jsonb_build_object(
    'actions', actions_value,
    'repeated', false,
    'sourceEventId', event_id_value
  );
  insert into private.play_session_consumed_social_events_v2 (
    event_id,
    payload_fingerprint,
    response
  ) values (
    event_id_value,
    payload_fingerprint_value,
    response_value
  );
  return response_value;
end;
$$;

comment on function private.consume_play_session_social_event_v2(jsonb) is
  'Replay-safe Session consumer for authoritative Social player.blocked.v2 facts; required envelope fields fail closed.';
