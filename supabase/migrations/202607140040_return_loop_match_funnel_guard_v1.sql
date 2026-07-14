-- Mission 4 consumes Mission 2's service-only funnel projection as a release
-- guard. The provider remains the sole owner of Match/conversation semantics.

alter function public.get_return_loop_release_readiness_v1(interval)
  rename to get_return_loop_release_readiness_without_match_guard_v1;

create or replace function public.get_return_loop_release_readiness_v1(
  p_window interval default interval '24 hours'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base_readiness jsonb;
  funnel jsonb;
  window_minutes integer;
  match_created_count integer;
  conversation_ready_count integer;
  pending_bootstrap_count integer;
  raw_divergence_count integer;
  unexplained_divergence_count integer;
  oldest_pending_seconds numeric;
  ready_rate numeric;
  match_conversation_funnel_healthy boolean;
  integrated_ready boolean;
begin
  base_readiness := public.get_return_loop_release_readiness_without_match_guard_v1(
    p_window
  );
  window_minutes := least(
    10080,
    greatest(1, ceil(extract(epoch from p_window) / 60.0)::integer)
  );
  funnel := public.get_match_funnel_metrics_v1(window_minutes);

  match_created_count := coalesce(
    (funnel #>> '{funnelCounts,match_created}')::integer,
    0
  );
  conversation_ready_count := coalesce(
    (funnel #>> '{funnelCounts,conversation_ready}')::integer,
    0
  );
  pending_bootstrap_count := coalesce(
    (funnel #>> '{outbox,pendingConversationBootstrap}')::integer,
    0
  );
  oldest_pending_seconds := coalesce(
    (funnel #>> '{outbox,oldestPendingSeconds}')::numeric,
    0
  );
  raw_divergence_count := greatest(
    match_created_count - conversation_ready_count,
    0
  );
  unexplained_divergence_count := greatest(
    raw_divergence_count - pending_bootstrap_count,
    0
  );
  ready_rate := case
    when match_created_count = 0 then null
    else least(
      conversation_ready_count::numeric / match_created_count::numeric,
      1
    )
  end;
  match_conversation_funnel_healthy :=
    unexplained_divergence_count = 0
    and oldest_pending_seconds <= 300;
  integrated_ready :=
    coalesce((base_readiness ->> 'ready')::boolean, false)
    and match_conversation_funnel_healthy;

  base_readiness := jsonb_set(
    base_readiness,
    '{metrics}',
    (base_readiness -> 'metrics') || jsonb_build_object(
      'matchCreatedCount', match_created_count,
      'conversationReadyCount', conversation_ready_count,
      'matchConversationDivergenceCount', raw_divergence_count,
      'unexplainedMatchConversationDivergenceCount',
        unexplained_divergence_count,
      'matchConversationReadyRate', ready_rate,
      'oldestMatchConversationPendingSeconds', oldest_pending_seconds
    )
  );
  base_readiness := jsonb_set(
    base_readiness,
    '{checks}',
    (base_readiness -> 'checks') || jsonb_build_object(
      'matchConversationFunnelHealthy', match_conversation_funnel_healthy
    )
  );
  return jsonb_set(base_readiness, '{ready}', to_jsonb(integrated_ready));
end;
$$;

revoke all on function public.get_return_loop_release_readiness_without_match_guard_v1(interval)
  from public, anon, authenticated;
revoke all on function public.get_return_loop_release_readiness_v1(interval)
  from public, anon, authenticated;
grant execute on function public.get_return_loop_release_readiness_without_match_guard_v1(interval)
  to service_role;
grant execute on function public.get_return_loop_release_readiness_v1(interval)
  to service_role;
