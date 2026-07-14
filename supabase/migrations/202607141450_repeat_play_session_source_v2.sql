-- Commit the additive enum value in its own migration. PostgreSQL does not allow
-- a newly-added enum value to be used safely before the ALTER TYPE transaction
-- commits.
alter type public.play_session_source_kind_v2
  add value if not exists 'repeat_play';
