# Match Intent v1

## Purpose

A Match intent describes what a player wants **for the current search session**.
It is intentionally separate from onboarding/profile habits, which describe stable
preferences. The backend may persist intents with a short TTL or keep them in a
queue/read model, but clients must not encode these choices into profile habits.

Vietnam is the only launch market for v1. The product uses locale `vi-VN` and
language `vi`. Thuộc tính tín ngưỡng cá nhân không được thu thập, lưu trữ,
trả về, chấm điểm hoặc cung cấp dưới dạng bộ lọc.

## Request shape

```json
{
  "mode": "ranked",
  "partyFormat": "duo",
  "sessionPlan": "quick",
  "roleSlugs": ["jungle"],
  "timezone": "Asia/Ho_Chi_Minh",
  "idempotencyKey": "match-intent:user-1:01"
}
```

### Fields

| Field            | Values                     | Meaning                                                 |
| ---------------- | -------------------------- | ------------------------------------------------------- |
| `mode`           | `ranked`, `normal`         | Queue/game mode for this search                         |
| `partyFormat`    | `duo`, `full_team`, `flex` | Desired party composition                               |
| `sessionPlan`    | `quick`, `long`            | A few games now or a longer climb/session               |
| `roleSlugs`      | 0-2 known role slugs       | Current role preference, not permanent profile identity |
| `timezone`       | IANA timezone              | Interprets local availability and scheduled intent time |
| `idempotencyKey` | stable unique client key   | Makes create/retry safe                                 |

The backend owns `id`, `profileId`, `status`, `createdAt`, `expiresAt`, and any
queue/ranking metadata. Intents should expire automatically; a new search should
not silently reuse an old mode or session plan.

## Availability policy

Onboarding currently captures coarse local time presets (`Sáng`, `Trưa`,
`Chiều`, `Tối`, `Khuya`). The mobile client projects those presets into recurring
`availability_slots` for all seven days because the UI does not yet collect
weekdays. Overnight windows are split at midnight.

For Match v1, availability overlap is a **soft ranking signal**:

- overlap increases recommendation score;
- no overlap does not remove an otherwise valid candidate;
- hard exclusion is reserved for authorization, blocks, moderation, closed/full
  sets, explicit mode incompatibility, and other safety/integrity rules;
- when weekday-specific scheduling exists, explicit intent timing overrides the
  coarse onboarding projection.

This prevents broad onboarding presets from causing false-negative matching while
still giving the backend useful ranking data.

## Response guidance

A successful create returns the normalized intent and expiry, for example:

```json
{
  "data": {
    "id": "intent-01",
    "mode": "ranked",
    "partyFormat": "duo",
    "sessionPlan": "quick",
    "roleSlugs": ["jungle"],
    "status": "active",
    "createdAt": "2026-07-11T14:00:00Z",
    "expiresAt": "2026-07-11T16:00:00Z"
  },
  "meta": {
    "requestId": "req-01"
  }
}
```

Clients branch on stable error codes, not diagnostic messages. At minimum support
`validation_failed`, `unauthenticated`, `rate_limited`, and `intent_conflict`.
