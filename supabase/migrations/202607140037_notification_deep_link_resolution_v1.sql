-- Notification Deep-Link Resolution v1
--
-- A push payload is not an authorization grant. The client submits only the
-- semantic NotificationId and source EventId. This resolver loads the
-- persisted notification for the authenticated PlayerId, advances read state,
-- validates the current target and returns the canonical persisted DeepLinkV1.

create type public.notification_deep_link_resolution_status_v1 as enum (
  'available',
  'defer_lifecycle',
  'defer_target',
  'disabled',
  'expired',
  'not_found',
  'player_unavailable',
  'provider_unavailable'
);

create table private.notification_deep_link_attempts_v1 (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null,
  source_event_id uuid not null,
  account_id uuid not null,
  player_id uuid not null,
  target text,
  status public.notification_deep_link_resolution_status_v1 not null,
  resolved_at timestamptz not null default now()
);

create index notification_deep_link_attempts_v1_player_resolved_idx
  on private.notification_deep_link_attempts_v1 (player_id, resolved_at desc);
create index notification_deep_link_attempts_v1_status_resolved_idx
  on private.notification_deep_link_attempts_v1 (status, resolved_at desc);

create or replace function public.resolve_notification_deep_link_v1(
  p_notification_id uuid,
  p_source_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_snapshot private.return_loop_player_snapshot_v1;
  notification public.notifications_v1%rowtype;
  canonical_deep_link jsonb;
  target_name text;
  target_exists boolean := false;
  resolution_status public.notification_deep_link_resolution_status_v1;
  transition_time timestamptz := clock_timestamp();
  notification_read_at timestamptz;
  target_lifecycle jsonb;
begin
  if actor_account_id is null then
    raise exception 'Authentication required'
      using errcode = '28000', detail = 'unauthenticated';
  end if;

  actor_snapshot := private.require_return_loop_player_snapshot_by_account_v1(
    actor_account_id,
    false
  );

  if not private.return_loop_feature_enabled_v1(
    'deep_link',
    actor_account_id
  ) then
    resolution_status := 'disabled';
  else
    select persisted.* into notification
    from public.notifications_v1 as persisted
    where persisted.id = p_notification_id
      and persisted.source_event_id = p_source_event_id
      and persisted.recipient_player_id = actor_snapshot.player_id
    for update;

    if notification.id is null then
      resolution_status := 'not_found';
    else
      canonical_deep_link := notification.deep_link;
      target_name := canonical_deep_link ->> 'target';

      update public.notifications_v1
      set seen_at = coalesce(seen_at, transition_time),
          read_at = coalesce(
            read_at,
            greatest(transition_time, coalesce(seen_at, transition_time))
          )
      where id = notification.id
      returning read_at into notification_read_at;

      if actor_snapshot.state in ('registered', 'onboarding') then
        resolution_status := 'defer_lifecycle';
      elsif actor_snapshot.state in ('suspended', 'deleting', 'deleted') then
        resolution_status := 'player_unavailable';
      elsif actor_snapshot.state <> 'active' then
        resolution_status := 'provider_unavailable';
      elsif target_name = 'match' then
        begin
          select exists (
            select 1
            from public.matches as match
            where match.id = (canonical_deep_link ->> 'matchId')::uuid
              and actor_snapshot.player_id in (
                match.player_low_id,
                match.player_high_id
              )
              and match.unmatched_at is null
          ) into target_exists;
          resolution_status := case
            when target_exists then 'available'
            else 'expired'
          end;
        exception
          when invalid_text_representation then
            resolution_status := 'expired';
        end;
      elsif target_name = 'conversation' then
        begin
          select exists (
            select 1
            from private.home_conversation_projection_v1 as projection
            where projection.player_id = actor_snapshot.player_id
              and projection.conversation_id =
                (canonical_deep_link ->> 'conversationId')::uuid
              and projection.match_id is not null
          ) into target_exists;
          resolution_status := case
            when target_exists then 'available'
            else 'defer_target'
          end;
        exception
          when invalid_text_representation then
            resolution_status := 'expired';
        end;
      elsif target_name = 'profile' then
        begin
          target_lifecycle := public.get_player_lifecycle_snapshot_v1(
            (canonical_deep_link ->> 'playerId')::uuid,
            false
          );
          resolution_status := case
            when target_lifecycle is null then 'expired'
            when target_lifecycle ->> 'state' in ('deleting', 'deleted')
              then 'expired'
            else 'available'
          end;
        exception
          when invalid_text_representation then
            resolution_status := 'expired';
          when undefined_function then
            resolution_status := 'provider_unavailable';
          when others then
            resolution_status := 'provider_unavailable';
        end;
      elsif target_name = 'set' then
        begin
          if to_regclass('public.match_sets_v1') is not null then
            execute
              'select exists (select 1 from public.match_sets_v1 where id = $1 and state <> ''closed'')'
              into target_exists
              using (canonical_deep_link ->> 'setId')::uuid;
            resolution_status := case
              when target_exists then 'available'
              else 'expired'
            end;
          elsif to_regclass('public.sets') is not null then
            execute
              'select exists (select 1 from public.sets where id = $1)'
              into target_exists
              using (canonical_deep_link ->> 'setId')::uuid;
            resolution_status := case
              when target_exists then 'available'
              else 'expired'
            end;
          elsif to_regclass('public.teams') is not null then
            execute
              'select exists (select 1 from public.teams where id = $1)'
              into target_exists
              using (canonical_deep_link ->> 'setId')::uuid;
            resolution_status := case
              when target_exists then 'available'
              else 'expired'
            end;
          else
            resolution_status := 'provider_unavailable';
          end if;
        exception
          when invalid_text_representation then
            resolution_status := 'expired';
          when undefined_table then
            resolution_status := 'provider_unavailable';
        end;
      else
        resolution_status := 'expired';
      end if;
    end if;
  end if;

  insert into private.notification_deep_link_attempts_v1 (
    notification_id,
    source_event_id,
    account_id,
    player_id,
    target,
    status,
    resolved_at
  ) values (
    p_notification_id,
    p_source_event_id,
    actor_account_id,
    actor_snapshot.player_id,
    target_name,
    resolution_status,
    transition_time
  );

  return jsonb_build_object(
    'notificationId', p_notification_id,
    'status', resolution_status,
    'deepLink', canonical_deep_link,
    'playerLifecycle', actor_snapshot.state,
    'readAt', notification_read_at,
    'resolvedAt', transition_time
  );
end;
$$;

revoke all on table private.notification_deep_link_attempts_v1
  from public, anon, authenticated;
revoke all on function public.resolve_notification_deep_link_v1(uuid, uuid)
  from public, anon;
grant execute on function public.resolve_notification_deep_link_v1(uuid, uuid)
  to authenticated;
