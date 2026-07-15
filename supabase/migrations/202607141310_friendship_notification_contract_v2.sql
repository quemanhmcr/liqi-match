-- Extend the existing Return Loop notification vocabulary for friendship.
-- Enum values are committed in a dedicated migration so following migrations
-- can safely persist them on every supported PostgreSQL deployment.

alter type public.notification_kind_v1
  add value if not exists 'friendship_requested';
alter type public.notification_kind_v1
  add value if not exists 'friendship_accepted';
