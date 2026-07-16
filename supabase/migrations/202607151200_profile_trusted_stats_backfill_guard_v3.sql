-- Repair the Mission 4 trusted-stat cutover on real PostgreSQL.
-- jsonb_set() does not create missing intermediate parents, so the original
-- nested-path backfill could leave unverified_legacy absent. Move legacy stats
-- under the explicit unverified namespace and reject authenticated inserts as
-- well as updates that attempt to reintroduce client-authored trust facts.

update public.profile_habits habits
set media_summary = jsonb_set(
  coalesce(habits.media_summary, '{}'::jsonb) - 'profile_stats',
  '{unverified_legacy}',
  (
    case
      when jsonb_typeof(habits.media_summary -> 'unverified_legacy') = 'object'
        then habits.media_summary -> 'unverified_legacy'
      else '{}'::jsonb
    end
  ) || jsonb_build_object(
    'profile_stats',
    habits.media_summary -> 'profile_stats'
  ),
  true
)
where jsonb_typeof(habits.media_summary -> 'profile_stats') = 'object';

create or replace function private.reject_authenticated_trusted_stats_mutation_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.media_summary ? 'profile_stats' then
      perform private.raise_core_error_v1(
        'trusted_stats_read_only',
        'Verified play statistics are platform-derived and cannot be edited by clients.'
      );
    end if;
    return new;
  end if;

  if coalesce(new.media_summary -> 'profile_stats', 'null'::jsonb)
    is distinct from coalesce(old.media_summary -> 'profile_stats', 'null'::jsonb) then
    perform private.raise_core_error_v1(
      'trusted_stats_read_only',
      'Verified play statistics are platform-derived and cannot be edited by clients.'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists profile_habits_reject_trusted_stats_mutation_v2
  on public.profile_habits;
create trigger profile_habits_reject_trusted_stats_mutation_v2
before insert or update of media_summary on public.profile_habits
for each row execute function private.reject_authenticated_trusted_stats_mutation_v2();

revoke execute on function private.reject_authenticated_trusted_stats_mutation_v2()
  from public, anon, authenticated;
grant execute on function private.reject_authenticated_trusted_stats_mutation_v2()
  to service_role;

comment on function private.reject_authenticated_trusted_stats_mutation_v2() is
  'Fail-closed trusted-stat boundary: authenticated inserts and updates cannot introduce client-authored profile_stats; historical values are retained only under unverified_legacy.';
