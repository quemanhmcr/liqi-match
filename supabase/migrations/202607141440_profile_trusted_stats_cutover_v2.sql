-- Core V2 Mission 4: legacy client-editable profile statistics are preserved only
-- as unverified history. Platform-derived trust facts remain authoritative in
-- player_reputation_ledger_v2 / player_reputation_projection_v2.

update public.profile_habits habits
set media_summary = jsonb_set(
  coalesce(habits.media_summary, '{}'::jsonb),
  '{unverified_legacy,profile_stats}',
  coalesce(habits.media_summary -> 'profile_stats', '{}'::jsonb),
  true
)
where jsonb_typeof(habits.media_summary -> 'profile_stats') = 'object'
  and habits.media_summary #> '{unverified_legacy,profile_stats}' is null;

create or replace function private.reject_authenticated_trusted_stats_mutation_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
    and coalesce(new.media_summary -> 'profile_stats', 'null'::jsonb)
      is distinct from coalesce(old.media_summary -> 'profile_stats', 'null'::jsonb) then
    perform private.raise_core_error_v1(
      'trusted_stats_read_only',
      'Verified play statistics are platform-derived and cannot be edited by clients.'
    );
  end if;
  return new;
end;
$$;

create trigger profile_habits_reject_trusted_stats_mutation_v2
before update of media_summary on public.profile_habits
for each row execute function private.reject_authenticated_trusted_stats_mutation_v2();

revoke execute on function private.reject_authenticated_trusted_stats_mutation_v2()
  from public, anon, authenticated;
grant execute on function private.reject_authenticated_trusted_stats_mutation_v2()
  to service_role;

comment on function private.reject_authenticated_trusted_stats_mutation_v2() is
  'Fail-closed cutover guard: authenticated clients cannot mutate legacy profile_stats. Service-role migration/backfill remains possible, but trusted public stats come only from the immutable Core V2 reputation ledger.';
