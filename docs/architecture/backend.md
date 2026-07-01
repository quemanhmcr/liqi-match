# Liqi Match Backend Foundation

## Boundaries

Supabase PostgreSQL is the source of truth for identity-adjacent app data, matching state, chat persistence, audit records, media metadata, and outbox events. Cloudflare R2 stores only binary objects. R2 object keys are referenced from `public.media_assets`; presigned URLs are never persisted.

The Expo app may call Supabase directly only where RLS allows it. Privileged operations use SQL RPC or Supabase Edge Functions. The mobile app must never receive service-role keys, R2 credentials, Cloudflare tokens, certificates, or private deployment credentials.

## Local Setup

Prerequisites:

- Node.js 24 LTS
- Docker Desktop for local Supabase
- Supabase CLI
- Wrangler

Commands:

```sh
npm ci
supabase start
supabase db reset
supabase test db
npm run lint
npm run typecheck
npm run test:ci
npm --prefix cloudflare/media-worker ci
npm --prefix cloudflare/media-worker run typecheck
npm --prefix cloudflare/media-worker test
```

Copy `.env.example` to `.env` for local Expo values. Use `.env.staging.example` and `.env.production.example` as deployment checklists only; do not commit filled secrets.

## Database

The foundation migration creates:

- Public app tables for profiles, game profile data, swipe/match/chat/team/report flows, and `media_assets`.
- Private operational tables for moderation, audit, outbox, and idempotency.
- RLS on every exposed public table.
- Default-deny behavior by omitting policies on tables/actions the client must not use directly.
- `public.record_swipe` as the transactional swipe/match/conversation entrypoint.

Reference tables such as ranks, roles, and heroes are readable. User-owned tables use `auth.uid()` policies. Matches and conversations are readable only by participants. Messages are read/inserted only by conversation members.

## Outbox And Reconciliation

`private.outbox_events` is the handoff between Postgres and external workers. Consumers must be idempotent and retryable. Media events currently include:

- `media_uploaded`
- `media_processing_requested`
- `media_delete_requested`

Reconciliation jobs should periodically:

- Mark old `pending` media as rejected or expired.
- Requeue failed deletes.
- Compare DB media records with R2 objects.
- Delete orphan R2 objects that do not have a valid DB record.
- Record all destructive actions in audit logs.

No distributed transaction is attempted between Postgres and R2.

## Generated Types

The canonical command is:

```sh
npm run supabase:types
```

CI verifies `src/shared/types/database.types.ts` matches the current local migrations.
