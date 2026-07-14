-- Supabase Cron is a production dependency of the Conversation bootstrap
-- dispatcher. Keep extension state reproducible in clean local/CI databases.

create extension if not exists pg_cron with schema pg_catalog;
