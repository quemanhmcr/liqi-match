# ADR 0006: Core V2 social relationship and safety authority

- Status: Accepted through checkpoints S1.1-S1.3
- DRI: Senior 1
- Date: 2026-07-14

## Decision

Core V2 social semantics use Core V1 `PlayerId` and lifecycle authority without a second identity map. A relationship aggregate is keyed by an unordered pair of distinct players and owns only pair-level social versioning. Friendship requests, directional blocks, directional mutes, privacy settings, reports and report evidence remain separate concerns.

Block is an immediate, private override. When either direction has an active block, providers must return `blocked = true` and fail closed for profile visibility, discovery, messaging, conversation access, session invites, presence and friendship mutations. Historical messages and completed-session records are not deleted by this authority; their visibility is enforced by the owning consumer. Unblock removes the override but never restores friendship automatically.

Friendship is authoritative only after an accepted friendship request. Match, conversation activity, completed sessions and reputation must not infer friendship.

Unverified reports do not change public reputation. Senior 4 may consume only moderation-confirmed outcomes if later policy explicitly allows it.

## State transitions

Friendship request:

`pending -> accepted | declined | cancelled | expired`

Friendship projection:

`none -> pending -> accepted -> removed`

A reciprocal pending request is resolved deterministically by accepting the older request, with `(created_at, id)` as the total ordering key. The second request is not created.

## Version and retry policy

Every mutation carries authenticated actor context, idempotency key, correlation ID and expected aggregate version. Request-specific mutations also carry expected request version. Creation commands use expected version zero. Durable receipts are returned on replay; reusing an idempotency key with a different request fails.

## Privacy defaults

- Profile: `everyone`
- Presence: `friends`
- Friendship requests: `everyone`
- Session invites: `friends`

Privacy never overrides block or Core V1 lifecycle.

## Consumer obligations

- Senior 2 consumes `canInviteToSession`, block direction and presence visibility.
- Senior 3 consumes `canMessage`, `canViewConversation`, mute state and block events.
- Senior 4 consumes relationship progression and report events without deriving reputation from unverified safety actions.
- Unknown contract/event versions fail closed.

## Rollback

Rollback disables Core V2 reads and mutations through feature flags while preserving canonical rows, receipts, events and audit history. It may temporarily restore legacy block reads. It must not drop Core V2 relationship history.

## Session consumer agreement (S1/S2)

- Before play starts, `player.blocked.v2` invalidates pending invites, join eligibility, member visibility and ready-check participation.
- During `in_progress` or `completion_pending`, block does not erase membership or historical session evidence. The session consumer transitions to `disputed` and retains authoritative history for outcome/safety review.
- Event replay must be idempotent and must not repeat the state transition.

## Trust and repeat-play consumer agreement (S1/S4)

Trust projection visibility is a separate privacy decision, not an alias for profile visibility. The Social provider returns `TrustVisibilityDecisionV2`; block always forces `canViewTrust = false`. Trust consumers may display cross-player projection only when this decision grants access.

Repeat-play recommendation remains a Senior 4 semantic, but candidates must be removed whenever the Social provider reports either directional block. A private block or an unverified report never changes public reputation facts.

## Profile and discovery integration agreement (S1.2)

Public mobile routes identify another person by canonical Core V1 `PlayerId`; the dynamic route is `/profile/[playerId]`. `ProfileId` and the legacy `profiles.id` UUID are storage/provider details and must not be used as social identity in navigation, commands or consumer capability checks.

The temporary `PlayerId -> ProfileId -> legacy_profile_id` bridge is exposed only through `resolve_visible_profile_identity_v2`. It validates Core V1 lifecycle plus the latest Core V2 `canViewProfile` capability. The legacy `profiles` RLS policy calls the same fail-closed social visibility authority, so a guessed legacy UUID cannot bypass privacy or block.

Profile relationship actions consume the exact `SocialRelationshipSnapshotV2` returned by the provider, send the server versions back with each command and update UI state only from an authoritative receipt. Discover and Home prefer `PlayerId` routes; simulation-only identity fallback remains a compatibility adapter, not a second semantic authority.

Blocked-user settings read `list_blocked_players_v2`, which returns viewer-owned directional blocks plus the exact relationship version required by `unblock_player_v2`. Mobile settings no longer query or delete legacy `blocks` rows directly; the legacy table remains rollback/shadow data only.

Profile Settings reads and writes the five canonical Social V2 policies through `PlayerPrivacyProvider`: profile visibility, presence visibility, friendship-request policy, session-invite policy and trust visibility. The mobile client sends the full current policy plus `expectedPrivacyVersion`, renders only the authoritative receipt and refetches after a version conflict. Core V1 discoverability remains a separate availability concern. `allowProfileShare` and `showWinRate` remain presentation preferences and must not be consumed as privacy, friendship, session or trust authority.

## Friendship notification integration agreement

`friendship.requested.v2` and `friendship.accepted.v2` remain Social-owned source events. A supplier-owned outbox projection creates the existing `notification.requested.v1` envelope with the friendship event as `causationId`; Return Loop continues to own notification persistence, inbox read state, push delivery, replay receipts and deep-link resolution.

Friendship notification navigation contains only the counterpart canonical `PlayerId`. It never contains a friendship request ID or client capability. Tapping opens `/profile/[playerId]`, where the latest relationship snapshot decides whether Accept, Cancel or no friendship action is available.

Block is checked both before notification persistence and during profile deep-link resolution. A block created after an inbox row was persisted therefore makes the old notification destination expire instead of reopening a hidden profile. Rollback disables friendship mutations or the Social read flag; it does not delete source events, projected notification requests or canonical relationship history.

## Message report entry agreement

Conversation exposes an explicit report action only for incoming messages whose `ConversationId`, `MessageId` and sender `PlayerId` all satisfy the canonical Core V1 schemas. Outgoing messages, typing indicators and simulation/local fixture IDs never receive report capability. The client sends only category plus canonical evidence identity through `report_message_v2`; it does not trust displayed sender text or infer message ownership.

The Social report authority rechecks conversation membership, message existence and authoritative sender at command time. The report insert synchronously triggers Conversation's private immutable snapshot capture in the same database transaction, eliminating a receipt-without-evidence crash window. The mobile workflow then verifies that snapshot through `capture_message_report_evidence_v2`; a capture timeout keeps the authoritative report receipt and retries evidence-only without resubmitting the report. Local retry-storage or cleanup failures never turn a successful server receipt into a failed-report screen. `report.submitted.v2` is a private safety signal; an unverified report does not directly alter public reputation or friendship state.

## Conversation consumer agreement (S1/S3)

The relationship aggregate is the conversation source for friendship-derived direct conversations. Consumers use `aggregateId` as `sourceId` and `aggregateVersion` as the monotonic `sourceVersion`. `friendship.accepted.v2` supplies the complete two-player active member set. Replay of the same event/source must return the existing direct conversation rather than create another.

`player.blocked.v2` supplies the same relationship source at a newer version. Its complete active member set is empty and the revocation reason is `blocked`. Conversation remains the owner of API, realtime and notification-delivery revocation and emits `conversation.access_revoked.v2`; Social does not define conversation state.

Historical conversation content is not deleted by block. Public conversation access remains revoked, while `canReport` stays available through a privileged report-evidence seam owned jointly by Social initiation and Conversation evidence resolution.

## Privacy and report initiation authority

Player privacy is a versioned self aggregate. Active players may update profile, presence, friendship-request, session-invite and trust-projection visibility through one optimistic-concurrency command. Suspended or otherwise unavailable players may still read their own privacy snapshot, but cannot mutate it. Consumers must evaluate the latest server capability at write time; client-cached privacy never grants authorization.

A submitted report is an immutable safety record, not a moderation verdict. `report.submitted.v2` never carries a reputation delta or public recommendation penalty. Any future reputation input requires a separate moderation-confirmed event and explicit policy ownership.

Message reports remain valid after a block because historical conversation membership and messages are retained. Social stores only the authoritative conversation/message reference and content fingerprint in its generic evidence row. For a Core V1 conversation, the compatibility provider owns the exact privileged snapshot in `private.message_report_evidence_v1`, including canonical sender, client message ID, sequence, content, creation time and tombstone time. The reporter-only `capture_message_report_evidence_v2(reportId)` RPC returns the strict Conversation evidence DTO without duplicating `reportId` in the response; other accounts cannot read it, and even service-role update/delete attempts are rejected by the immutability trigger. When Conversation V2 tables are installed, the same RPC delegates to the Conversation-owned membership, message and `message_report_evidence_v2` authority instead of redefining those semantics.

Rollback disables Core V2 privacy/report writes through the shared social feature gate while preserving privacy versions, reports, evidence references, receipts, events, metrics and audit history. Canonical safety history is never deleted during rollback.
