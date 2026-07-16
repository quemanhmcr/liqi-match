# ADR 0007: Core V2 activity notification delivery boundary

- Status: accepted for checkpoint S4.3
- Supplier: Senior 4 (activity eligibility, engagement preferences, frequency cap)
- Consumer: Senior 3 (notification persistence, push delivery, deep-link/click facts)

## Decision

Senior 4 emits an activity notification request only after evaluating activity
eligibility, the player's engagement preferences, kind-specific preferences,
and the authoritative daily frequency cap. The request includes the exact
eligibility decision, its preference version and frequency-window evidence.
Senior 3 validates and records that decision but never recalculates it.

Senior 3 owns delivery mechanics after the supplier decision:

- deterministic deduplication by recipient plus activity deduplication key;
- persisted inbox request and push request status;
- device, token, foreground-presence and provider-runtime suppression;
- correlation and causation preservation;
- typed deep-link target persistence;
- immutable notification click facts.

A runtime delivery failure or foreground suppression may change only the push
status. It does not mutate the activity item, engagement preference, frequency
counter, session outcome or reputation projection.

## Typed targets

Activity payload remains supplier-owned presentation data. Notification routing
does not branch on free-form payload text. The delivery request carries one
strict target:

- `feedback_prompt` -> `session_feedback(sessionId, outcomeId?)`
- `reputation_progress` -> `reputation(playerId)`
- `repeat_play_recommendation` -> `repeat_play(teammatePlayerIds, sourceSessionId?)`

The feedback target preserves canonical session context and the original
correlation ID through notification request, push payload resolution and click
telemetry. Until the Senior 2 session/feedback route is installed, the mobile
resolver must return a deferred-target result rather than claiming the target is
available or routing to a generic screen.

## Expo SDK 56 notes

Notification responses are collected from both the initial response and the live
response listener at the root navigation boundary. The notification identifier,
source event ID and correlation context are persisted before navigation. A route
is not an authorization boundary: target availability and player lifecycle are
revalidated against the server after cold start, account switch and token
refresh.

Background notification execution is not required for correctness. Inbox and
click facts recover from authoritative state on foreground/reconnect. Push
presentation may be suppressed while the relevant surface is active without
consuming or rewriting Senior 4's activity eligibility decision.

## Rollback

Activity push can be disabled independently while persisted activity inbox items
and click correlation remain readable. Delivery retries reuse the original
source event and deduplication key. Rollback never deletes activity, notification
or click history.
