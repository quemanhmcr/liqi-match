# Notifications domain and backend handoff

## Current runtime

The application currently binds `NotificationInboxRepository` to the local
`MockNotificationInboxRepository` in
`data/notification-inbox.repository.ts`. The mock is intentionally shaped like
server state: it is asynchronous, account-scoped, cursor-based, abortable and
persisted. UI code does not import mock fixtures or AsyncStorage.

A backend developer should implement the same repository interface and change
only that runtime binding. Home, NotificationsScreen, query keys, optimistic
updates and presentation mapping should not need transport-specific edits.

## State semantics

- `seenAt`: the notification has been exposed in the focused inbox. This drives
  the Home red dot and the `new` to `unread` presentation transition.
- `readAt`: the user opened the notification or its primary action. Reading
  implies seen; focusing the inbox does **not** imply read. Presentation derives
  `new`, `unread` and `read` from these two timestamps.
- Action completion is intentionally not modelled yet. Add `actionedAt` only
  when an action has a real backend command and success state.

The screen marks notifications seen through a composite watermark
`(occurredAt, id)`. The backend mutation must update only rows at or before that
watermark. A notification inserted after the inbox response therefore remains
unseen and makes the badge reappear.

## Repository contract

`NotificationInboxRepository` owns four operations:

1. `getSummary` — lightweight unseen count for Home.
2. `list` — cursor page plus total unseen count and latest notification watermark.
3. `markSeenThrough` — idempotent bulk seen mutation bounded by watermark.
4. `markRead` — idempotent item mutation; read also sets seen.

Every operation receives the authenticated session and optional abort signal.
Responses use domain records, ISO timestamps and typed payloads. Backend rows or
Edge Function DTOs must be mapped inside the adapter, never inside screens.

## Suggested backend shape

The contract can map to a table with fields equivalent to:

- `id`, `recipient_id`, `kind`, `payload`
- `occurred_at`, `seen_at`, `read_at`

Enforce recipient ownership with RLS. Index `(recipient_id, occurred_at desc,
id desc)` and a partial unseen index if unread volume warrants it. Cursor and
watermark ordering must use the same `(occurred_at, id)` tuple.

Do not let the backend send UI colors, Ionicon names, Vietnamese relative-time
labels or local asset references. `features/notifications/model` owns that
presentation mapping. Actor avatar URLs are optional in the domain; the mock
adapter relies on feature-local actor-id fallbacks only for visual review.

## Cache and failure behavior

TanStack Query keys are scoped by `userId`, preventing account leakage. Seen and
read mutations cancel in-flight queries, optimistically update feed/summary,
roll back on error, then invalidate both views. Empty, loading and error states
are distinct; a failed request is never presented as an empty inbox.

## Backend integration checklist

- Add a concrete repository adapter beside the mock adapter.
- Map transport DTOs to every `NotificationRecord` kind exhaustively.
- Preserve cursor, watermark and idempotency semantics.
- Return total unseen count independently of current page size.
- Consume the provided `AbortSignal`.
- Add contract tests using the same behavior cases as the mock repository.
- Switch the runtime binding; do not import Supabase/API code into screens.
- Keep action navigation separate until each destination route really exists.
