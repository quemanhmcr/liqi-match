-- Authenticated Home projection for authoritative Match facts. This query does
-- not own unread, presence, notification, or conversation timeline semantics.

create or replace function public.list_home_match_facts_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_account_id uuid := auth.uid();
  actor_identity jsonb;
  actor_player_id uuid;
  facts jsonb;
begin
  if actor_account_id is null then
    perform private.raise_core_error_v1(
      'unauthenticated',
      'Authentication is required.'
    );
  end if;

  actor_identity := public.resolve_player_identity_v1(actor_account_id, false);
  if actor_identity is null then
    perform private.raise_core_error_v1(
      'player_not_found',
      'The authenticated player identity was not found.'
    );
  end if;
  actor_player_id := (actor_identity ->> 'playerId')::uuid;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'canMessage',
          matches.home_status_v1 = 'conversation_ready'
          and conversations.id is not null,
        'conversationId', case
          when matches.home_status_v1 = 'conversation_ready'
          then conversations.id
          else null
        end,
        'correlationId', matches.correlation_id_v1,
        'createdAt', matches.created_at,
        'kind', matches.home_kind_v1,
        'matchId', matches.id,
        'opponent', private.player_summary_v1(
          case
            when matches.player_low_id = actor_player_id
            then matches.player_high_id
            else matches.player_low_id
          end
        ),
        'participantIds', jsonb_build_array(
          matches.player_low_id,
          matches.player_high_id
        ),
        'source', matches.source_v1,
        'status', matches.home_status_v1
      )
      order by matches.created_at desc, matches.id
    ),
    '[]'::jsonb
  )
  into facts
  from public.matches matches
  left join public.conversations conversations
    on conversations.match_id = matches.id
  where actor_player_id in (matches.player_low_id, matches.player_high_id)
    and matches.player_low_id is not null
    and matches.player_high_id is not null
    and matches.source_v1 is not null
    and matches.correlation_id_v1 is not null
    and matches.home_kind_v1 is not null
    and matches.home_status_v1 is not null
    and private.player_summary_v1(
      case
        when matches.player_low_id = actor_player_id
        then matches.player_high_id
        else matches.player_low_id
      end
    ) is not null;

  return jsonb_build_object(
    'generatedAt', now(),
    'items', facts
  );
end;
$$;

comment on function public.list_home_match_facts_v1() is
  'Authenticated Home Match facts. Match kind/status and Match-to-Conversation readiness are persisted server authority; unread/presence remain outside this capability.';

revoke execute on function public.list_home_match_facts_v1()
  from public, anon;
grant execute on function public.list_home_match_facts_v1()
  to authenticated, service_role;
