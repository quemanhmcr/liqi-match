-- Consume Social-owned player.blocked.v2 facts without redefining block state.
-- Live Social capability checks fail closed immediately; the replay-safe event
-- consumer then records durable Session consequences so a later unblock never
-- resurrects an invite, membership, ready response, or member-list permission.

create table private.play_session_consumed_social_events_v2 (
  event_id uuid primary key references private.outbox_events(id) on delete restrict,
  payload_fingerprint text not null,
  response jsonb not null,
  processed_at timestamptz not null default now()
);

create table private.play_session_social_event_failures_v2 (
  event_id uuid primary key references private.outbox_events(id) on delete restrict,
  attempt_count integer not null default 1 check (attempt_count > 0),
  available_at timestamptz not null default now(),
  last_error text not null,
  updated_at timestamptz not null default now()
);

create index play_session_social_event_failures_v2_available_idx
  on private.play_session_social_event_failures_v2 (available_at, event_id);

create table private.play_session_social_visibility_revocations_v2 (
  session_id uuid not null references public.play_sessions_v2(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  source_event_id uuid not null references private.outbox_events(id) on delete restrict,
  reason_code text not null check (char_length(reason_code) between 1 and 64),
  revoked_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (session_id, player_id)
);

create index play_session_social_visibility_revocations_v2_event_idx
  on private.play_session_social_visibility_revocations_v2 (source_event_id, session_id);

create or replace function private.assert_play_session_social_worker_v2()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    perform private.raise_core_error_v1(
      'forbidden',
      'Session social-event processing requires service role.'
    );
  end if;
end;
$$;

create or replace function private.is_play_session_visibility_revoked_v2(
  p_session_id uuid,
  p_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.play_session_social_visibility_revocations_v2 revoked
    where revoked.session_id = p_session_id
      and revoked.player_id = p_player_id
  ) or exists (
    select 1
    from public.play_session_members_v2 other_members
    where other_members.session_id = p_session_id
      and other_members.state = 'active'
      and other_members.player_id <> p_player_id
      and private.are_players_blocked_v2(
        p_player_id,
        other_members.player_id
      )
  );
$$;

create or replace function private.assert_play_session_visible_v2(
  p_session_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.is_play_session_visibility_revoked_v2(
    p_session_id,
    p_player_id
  ) then
    perform private.raise_core_error_v1(
      'session_visibility_revoked',
      'Session visibility was revoked by Social safety authority.'
    );
  end if;
end;
$$;

create or replace function private.enforce_ready_response_social_safety_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_id_value uuid;
begin
  select checks.session_id
  into session_id_value
  from public.play_session_ready_checks_v2 checks
  where checks.id = new.ready_check_id;

  if session_id_value is null then
    perform private.raise_core_error_v1(
      'ready_check_not_open',
      'The requested ready check does not exist.'
    );
  end if;
  perform private.assert_play_session_visible_v2(
    session_id_value,
    new.player_id
  );
  return new;
end;
$$;

create trigger play_session_ready_responses_social_safety_v2
before insert or update on public.play_session_ready_responses_v2
for each row execute function private.enforce_ready_response_social_safety_v2();

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

create or replace function public.process_pending_play_session_social_events_v2(
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row record;
  result_value jsonb;
  results_value jsonb := '[]'::jsonb;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  perform private.assert_play_session_social_worker_v2();

  for event_row in
    select events.id, events.payload
    from private.outbox_events events
    left join private.play_session_social_event_failures_v2 failures
      on failures.event_id = events.id
    where events.event_type = 'player.blocked.v2'
      and events.contract_version = 2
      and not exists (
        select 1
        from private.play_session_consumed_social_events_v2 consumed
        where consumed.event_id = events.id
      )
      and coalesce(failures.available_at, '-infinity'::timestamptz) <= now()
    order by events.created_at, events.id
    limit safe_limit
    for update of events skip locked
  loop
    begin
      result_value := private.consume_play_session_social_event_v2(event_row.payload);
      delete from private.play_session_social_event_failures_v2
      where event_id = event_row.id;
      results_value := results_value || jsonb_build_array(result_value);
    exception when others then
      insert into private.play_session_social_event_failures_v2 (
        event_id,
        attempt_count,
        available_at,
        last_error
      ) values (
        event_row.id,
        1,
        now() + interval '5 seconds',
        left(sqlerrm, 2000)
      ) on conflict (event_id) do update
      set attempt_count = private.play_session_social_event_failures_v2.attempt_count + 1,
          available_at = now() + make_interval(
            secs => least(
              3600,
              greatest(
                5,
                (
                  private.play_session_social_event_failures_v2.attempt_count + 1
                ) * (
                  private.play_session_social_event_failures_v2.attempt_count + 1
                ) * 5
              )
            )
          ),
          last_error = excluded.last_error,
          updated_at = now();
      results_value := results_value || jsonb_build_array(jsonb_build_object(
        'errorCode', coalesce(nullif(sqlstate, ''), 'unknown'),
        'sourceEventId', event_row.id,
        'status', 'retry_scheduled'
      ));
    end;
  end loop;

  return jsonb_build_object(
    'processedCount', jsonb_array_length(results_value),
    'results', results_value
  );
end;
$$;

create or replace function public.dispatch_play_session_social_events_v2(
  p_limit integer default 50
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.process_pending_play_session_social_events_v2(
    greatest(1, least(coalesce(p_limit, 50), 100))
  );
$$;

create or replace function public.get_play_session_v2(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_mapping jsonb;
  actor_player_id uuid;
  session_snapshot jsonb;
begin
  perform private.assert_party_session_feature_v2('read');
  actor_mapping := private.resolve_party_session_actor_v2(true, false);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;

  if p_session_id is null then
    perform private.raise_core_error_v1(
      'validation_failed',
      'PlaySessionId is required.'
    );
  end if;
  if not exists (
    select 1
    from public.play_session_members_v2 members
    where members.session_id = p_session_id
      and members.player_id = actor_player_id
  ) then
    perform private.raise_core_error_v1(
      'forbidden',
      'Session membership history is required.'
    );
  end if;
  perform private.assert_play_session_visible_v2(
    p_session_id,
    actor_player_id
  );

  session_snapshot := private.play_session_snapshot_v2(p_session_id);
  if session_snapshot is null then
    perform private.raise_core_error_v1('not_found', 'The Play Session was not found.');
  end if;
  return session_snapshot;
end;
$$;

create or replace function public.list_current_play_sessions_v2(
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_mapping jsonb;
  actor_player_id uuid;
begin
  perform private.assert_party_session_feature_v2('read');
  actor_mapping := private.resolve_party_session_actor_v2(true, false);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;

  if p_limit is null or p_limit not between 1 and 50 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Session list limit must be between 1 and 50.'
    );
  end if;

  return coalesce(
    (
      select jsonb_agg(items.session order by items.updated_at desc, items.session_id)
      from (
        select
          sessions.id as session_id,
          sessions.updated_at,
          private.play_session_snapshot_v2(sessions.id) as session
        from public.play_sessions_v2 sessions
        join public.play_session_members_v2 members
          on members.session_id = sessions.id
        where members.player_id = actor_player_id
          and members.state = 'active'
          and not private.is_play_session_visibility_revoked_v2(
            sessions.id,
            actor_player_id
          )
        order by sessions.updated_at desc, sessions.id
        limit p_limit
      ) items
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.list_my_session_invites_v2(
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_mapping jsonb;
  actor_player_id uuid;
begin
  perform private.assert_party_session_feature_v2('read');
  actor_mapping := private.resolve_party_session_actor_v2(true, false);
  actor_player_id := (actor_mapping ->> 'playerId')::uuid;

  if p_limit is null or p_limit not between 1 and 50 then
    perform private.raise_core_error_v1(
      'validation_failed',
      'Session invite list limit must be between 1 and 50.'
    );
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'inviteId', items.invite_id,
          'sessionId', items.session_id,
          'inviterPlayerId', items.inviter_player_id,
          'targetPlayerId', actor_player_id,
          'state', items.invite_state,
          'version', items.invite_version,
          'expiresAt', items.expires_at,
          'createdAt', items.created_at,
          'session', items.session
        ) order by items.created_at desc, items.invite_id
      )
      from (
        select
          invites.id as invite_id,
          invites.session_id,
          invites.inviter_player_id,
          invites.state as invite_state,
          invites.version as invite_version,
          invites.expires_at,
          invites.created_at,
          private.play_session_snapshot_v2(invites.session_id) as session
        from public.play_session_invites_v2 invites
        join public.play_sessions_v2 sessions on sessions.id = invites.session_id
        where invites.target_player_id = actor_player_id
          and invites.state = 'pending'
          and (invites.expires_at is null or invites.expires_at > now())
          and sessions.state = 'recruiting'
          and not private.are_players_blocked_v2(
            invites.inviter_player_id,
            actor_player_id
          )
          and not private.is_play_session_visibility_revoked_v2(
            invites.session_id,
            actor_player_id
          )
        order by invites.created_at desc, invites.id
        limit p_limit
      ) items
    ),
    '[]'::jsonb
  );
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_extension
    where extname = 'pg_cron'
  ) then
    raise exception 'Supabase Cron must be enabled before Session social-safety cutover'
      using errcode = '55000', detail = 'pg_cron_required';
  end if;
end;
$$;

select cron.schedule(
  'play-session-social-safety-v2',
  '5 seconds',
  $job$select public.dispatch_play_session_social_events_v2(50);$job$
);

revoke all on private.play_session_consumed_social_events_v2
  from public, anon, authenticated;
revoke all on private.play_session_social_event_failures_v2
  from public, anon, authenticated;
revoke all on private.play_session_social_visibility_revocations_v2
  from public, anon, authenticated;
grant all on private.play_session_consumed_social_events_v2 to service_role;
grant all on private.play_session_social_event_failures_v2 to service_role;
grant all on private.play_session_social_visibility_revocations_v2 to service_role;

revoke execute on function private.assert_play_session_social_worker_v2()
  from public, anon, authenticated;
revoke execute on function private.is_play_session_visibility_revoked_v2(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.assert_play_session_visible_v2(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.enforce_ready_response_social_safety_v2()
  from public, anon, authenticated;
revoke execute on function private.consume_play_session_social_event_v2(jsonb)
  from public, anon, authenticated;
grant execute on function private.assert_play_session_social_worker_v2()
  to service_role;
grant execute on function private.is_play_session_visibility_revoked_v2(uuid, uuid)
  to service_role;
grant execute on function private.assert_play_session_visible_v2(uuid, uuid)
  to service_role;
grant execute on function private.consume_play_session_social_event_v2(jsonb)
  to service_role;

revoke execute on function public.process_pending_play_session_social_events_v2(integer)
  from public, anon, authenticated;
revoke execute on function public.dispatch_play_session_social_events_v2(integer)
  from public, anon, authenticated;
grant execute on function public.process_pending_play_session_social_events_v2(integer)
  to service_role;
grant execute on function public.dispatch_play_session_social_events_v2(integer)
  to service_role;

comment on function private.consume_play_session_social_event_v2(jsonb) is
  'Replay-safe Session consumer for authoritative Social player.blocked.v2 facts.';
comment on function public.dispatch_play_session_social_events_v2(integer) is
  'Service-role and pg_cron entrypoint for five-second Session safety revocation.';
