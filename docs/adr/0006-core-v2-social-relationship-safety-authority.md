# ADR 0006: Core V2 social relationship and safety authority

- Status: Proposed for checkpoint S1.1 review
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

## Conversation consumer agreement (S1/S3)

The relationship aggregate is the conversation source for friendship-derived direct conversations. Consumers use `aggregateId` as `sourceId` and `aggregateVersion` as the monotonic `sourceVersion`. `friendship.accepted.v2` supplies the complete two-player active member set. Replay of the same event/source must return the existing direct conversation rather than create another.

`player.blocked.v2` supplies the same relationship source at a newer version. Its complete active member set is empty and the revocation reason is `blocked`. Conversation remains the owner of API, realtime and notification-delivery revocation and emits `conversation.access_revoked.v2`; Social does not define conversation state.

Historical conversation content is not deleted by block. Public conversation access remains revoked, while `canReport` stays available through a privileged report-evidence seam owned jointly by Social initiation and Conversation evidence resolution.
