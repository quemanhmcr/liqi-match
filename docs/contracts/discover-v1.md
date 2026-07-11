# Discover API Contract v1

## Status

This document describes the frontend-owned contract for the **Khám Phá / Discover** surface. The app currently uses `MockDiscoverRepository`; no backend endpoint, database migration, RPC, Edge Function, or deployment is implemented by this change.

The future backend implementation is complete when it can satisfy `DiscoverRepository` through `ApiDiscoverRepository` without changing screens or presentation components.

## Source of truth

Executable schemas live in:

```text
src/features/discover/contracts/discover-contracts.ts
```

Transport wiring lives in:

```text
src/features/discover/services/discover-api-repository.ts
```

Documented JSON examples under `docs/contracts/examples/` are validated by Jest against the production Zod schemas. TypeScript interfaces alone are not accepted as runtime validation.

## Boundary rules

- JSON keys use `camelCase`.
- IDs and cursors are opaque strings. Clients must not parse UUIDs, offsets, or storage keys from them.
- Timestamps are ISO 8601 UTC/offset strings.
- Backend responses carry structured facts and capabilities, not UI color, icon, button copy, or formatted counts.
- `player-recommendations` are recommendations, not records from the existing `matches` domain.
- A Discover Set is a recruitment surface and is not assumed to map one-to-one to the existing `teams` table.
- The backend is authoritative for visibility, blocks, moderation, availability, permissions, capacity, and action capability.

## Authentication and request context

All endpoints are intended for an authenticated app session when connected to production. The transport passes the current `AuthSession`; the final HTTP implementation must send the bearer token through the standard app transport.

Every GET request includes:

| Parameter  | Meaning                                                              |
| ---------- | -------------------------------------------------------------------- |
| `locale`   | UI locale, currently `vi`                                            |
| `timezone` | IANA timezone used for recommendation/context calculations           |
| `query`    | Optional normalized user query input; backend must still validate it |
| `facetId`  | Repeated query parameter; all selected facets use AND semantics      |

Viewer identity is derived from authentication, never trusted from a `viewerId` query parameter.

## Response envelope

Read endpoints return:

```json
{
  "contractVersion": 1,
  "data": {},
  "meta": {
    "requestId": "req-123",
    "generatedAt": "2026-07-11T08:00:00.000Z"
  }
}
```

`requestId` must be suitable for logs/support correlation. `generatedAt` is also used to derive relative UI labels such as “opened 4 minutes ago”.

## Endpoint matrix

| Method | Route                                     | Purpose                                       |
| ------ | ----------------------------------------- | --------------------------------------------- |
| `GET`  | `/v1/discover/overview`                   | Initial Explore preview, filters, and metrics |
| `GET`  | `/v1/discover/vibes`                      | Cursor-paginated Vibe list                    |
| `GET`  | `/v1/discover/sets`                       | Cursor-paginated recruitment Set list         |
| `GET`  | `/v1/discover/player-recommendations`     | Cursor-paginated player recommendations       |
| `POST` | `/v1/discover/sets/{setId}/join-requests` | Request to join an eligible Set               |
| `POST` | `/v1/discover/sets/{setId}/invites`       | Invite a recommended player to a specific Set |

Route constants and URL encoding are covered by `discover-api-repository.test.ts`.

## Overview

### Request

```text
GET /v1/discover/overview?query=duo&facetId=mic&previewLimit=3&locale=vi&timezone=Asia%2FBangkok
```

`previewLimit` is clamped by the frontend schema to 1–20. The response contains three independently typed sections plus filter options and metrics. A future backend may compute this through an API/BFF/RPC; storage shape is not part of this contract.

Example: `examples/discover-overview.response.json`.

## List endpoints

Common parameters:

| Parameter | Contract                                             |
| --------- | ---------------------------------------------------- |
| `cursor`  | Optional opaque cursor returned by the previous page |
| `limit`   | 1–50                                                 |
| `facetId` | Repeated canonical facet ID, AND semantics           |
| `query`   | Up to 120 characters                                 |
| `sort`    | Resource-specific enum                               |

Sort values:

- Vibes: `popular`, `newest`, `best_match`
- Sets: `best_match`, `almost_full`, `newest`
- Player recommendations: `best_match`, `online`, `newest`

Page data:

```json
{
  "items": [],
  "pageInfo": {
    "hasNextPage": false,
    "nextCursor": null
  },
  "totalCount": 0
}
```

`totalCount` is optional. `hasNextPage=true` requires a non-null opaque `nextCursor` by backend convention. Clients do not construct cursors.

Examples:

- `examples/discover-vibes.response.json`
- `examples/discover-sets.response.json`
- `examples/discover-player-recommendations.response.json`

## Vibe resource

The backend returns:

- identity and slug;
- title;
- semantic activity type;
- media descriptor;
- facet IDs;
- typed engagement kind/count;
- participant total and preview avatars.

It must not return `interestedLabel`, `surplusLabel`, gradients, focal positions, or card dimensions. Those are frontend presentation concerns.

Vibe selection remains local UI state in v1 because no persistence requirement has been established.

## Set resource

Important structured fields:

- `mode`: `rank` or `team_rank`;
- `occupancy.current/capacity`;
- `openedAt`;
- `recruitment.status`;
- typed `missingRoles`;
- `requiresRoleSelection` and `requiresApproval`;
- `communication.voicePolicy`;
- typed tags (`hero`, `role`, `trait`, `schedule`, `other`);
- member total/preview;
- viewer relationship and join-request state;
- explicit capabilities;
- monotonic `version` for stale-write protection.

The frontend derives `4/5`, `Thiếu Mid`, Rank/Team Rank appearance, and `Xin vào`/`Xem set` from those facts. Backend code must not send `actionLabel`, `actionTone`, `badgeTone`, or formatted slot strings.

## Player recommendation resource

This resource includes:

- public profile identity/display fields;
- coarse online status respecting privacy;
- rank/primary role references;
- numeric match score;
- human-readable match reasons with stable semantic codes;
- facets;
- capabilities for profile view, messaging, and inviting.

When `capabilities.invite.state` is `available`, `pending`, `accepted`, `declined`, or `cancelled`, `targetSetId` is required by the runtime schema. An invite cannot exist without an explicit Set context.

The backend must not expose private ranking features, raw moderation scores, email, auth metadata, or exact last-seen timestamps when privacy does not allow them.

## Join request mutation

```text
POST /v1/discover/sets/{setId}/join-requests
Idempotency-Key: <same value as body.idempotencyKey>
```

Request and response examples:

- `examples/request-set-join.request.json`
- `examples/request-set-join.response.json`

Rules:

- The authenticated user is the actor; actor identity is not accepted from the body.
- Path `setId` and body `setId` must match.
- The operation must be transactional and idempotent.
- Repeating a successful key returns the same logical receipt with `repeated=true`.
- `expectedSetVersion` may be used for optimistic concurrency.
- Backend rechecks open status, capacity, blocks, moderation, membership, approval, and role requirements at write time.

## Player invite mutation

```text
POST /v1/discover/sets/{setId}/invites
Idempotency-Key: <same value as body.idempotencyKey>
```

Request and response examples:

- `examples/invite-player.request.json`
- `examples/invite-player.response.json`

Rules:

- The actor must have permission to invite for the Set.
- The target profile must still be discoverable/eligible and not blocked.
- Path `setId`, body `setId`, and the recommendation capability target must agree.
- Retry with the same idempotency key cannot create duplicate invites.

## Idempotency

The frontend sends both:

- `Idempotency-Key` HTTP header;
- `idempotencyKey` in the validated body.

The backend should store a request fingerprint and stable receipt for the authenticated actor. Reusing one key with a different operation or body should return a conflict rather than executing it.

A timeout is not proof that a write failed. Client retries reuse the same key for the same logical attempt.

## Error semantics

The service layer recognizes these stable codes:

```text
unauthenticated
forbidden
validation_failed
not_found
set_full
set_closed
join_request_exists
invite_exists
invite_target_required
target_unavailable
version_conflict
rate_limited
stale_cursor
network_error
contract_violation
unknown
```

HTTP status guidance:

| Code                                         | Suggested status |
| -------------------------------------------- | ---------------- |
| `unauthenticated`                            | 401              |
| `forbidden`                                  | 403              |
| `not_found`                                  | 404              |
| `validation_failed`                          | 400/422          |
| `set_full`, `set_closed`, `version_conflict` | 409              |
| `rate_limited`                               | 429              |
| `stale_cursor`                               | 400/410          |

Error messages are diagnostic; clients branch on code, not text. Responses should include a request ID. Existing-state conditions such as an already-created join request may be returned as the same successful receipt with `repeated=true`.

## Cache and mutation expectations

React Query keys include the viewer ID to prevent account-to-account cache leakage. After successful mutations the frontend immediately reconciles matching overview/list cache items to `pending`; a future network adapter may then refetch for authoritative reconciliation.

Server-owned action state does not live in Zustand. Zustand contains only local criteria, panel state, and local view selection.

## Security and privacy requirements

Backend implementation must enforce:

- RLS/authorization independent of client capabilities;
- discoverability and block rules;
- moderation/deletion filtering;
- Set ownership/membership/action permissions;
- capacity and version checks at mutation time;
- rate limiting and abuse protection;
- minimum data disclosure for cards;
- no service-role, R2, Cloudflare, or private operational credentials in mobile responses.

Remote media URLs must come from the approved media delivery layer. Persistent records should reference media IDs/object keys, not expiring signed URLs.

## Known backend domain gaps

The current backend foundation has profiles, ranks, roles, heroes, availability, preferences, swipes/matches, conversations, teams, and members. It does not yet define these product concepts completely:

- curated/dynamic Vibe feed;
- open recruitment Set/listing and slot requirements;
- join-request lifecycle;
- Set-scoped player invite lifecycle;
- recommendation scoring/read model;
- cursor snapshot policy for recommendation feeds.

Backend design should decide whether these are tables, views, RPCs, materialized read models, or API orchestration. The frontend contract deliberately does not prescribe storage.

## Backend implementation checklist

1. Choose API ownership and transport implementation.
2. Implement the six routes exactly or version the contract explicitly.
3. Map storage/read models to the structured DTOs.
4. Validate request schemas and emit stable error codes.
5. Add authenticated authorization/RLS tests.
6. Add idempotency and concurrency tests.
7. Validate backend fixtures/responses against generated JSON Schema or equivalent contract tests.
8. Replace the frontend repository binding from mock to API behind configuration; do not change screen/component APIs.
9. Run the existing Discover contract, adapter, repository, and UI regression suites.
