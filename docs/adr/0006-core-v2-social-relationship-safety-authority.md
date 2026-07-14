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
