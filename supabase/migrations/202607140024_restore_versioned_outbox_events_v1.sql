-- Restore additive Core v1 domain-event compatibility.
--
-- Identity introduced shape validation for versioned event names. Later
-- authority migrations temporarily replaced that rule with closed whitelists,
-- which blocked valid provider-owned events such as player.activated.v1.

alter table private.outbox_events
  drop constraint if exists outbox_events_event_type_check;

alter table private.outbox_events
  add constraint outbox_events_event_type_check check (
    event_type in (
      'media_uploaded',
      'media_delete_requested',
      'media_processing_requested',
      'push_notification_requested',
      'account_deletion_requested'
    )
    or event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+\.v[1-9][0-9]*$'
  );
