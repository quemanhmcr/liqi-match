# Media Worker

The worker is a deployable backend service with inward-pointing dependencies:

```text
index -> worker (composition root)
              |-> transport -> application -> domain
              |-> infrastructure ---------> domain
              `-> platform types
```

- `domain/media`: pure delivery, visibility, and byte-validation policy.
- `application`: authorization, processing, deletion use cases and ports; no Cloudflare or Supabase adapter imports.
- `infrastructure`: JWT, Supabase REST, R2, and queue adapters.
- `transport`: public media HTTP, authenticated internal queue publication, and queue consumption.
- `worker`: the only composition root allowed to join transports and adapters.

## Runtime endpoints

- `GET /media/:assetId`: policy-aware delivery from private R2.
- `POST /internal/media/process`: validates `INTERNAL_WORKER_TOKEN` and publishes a `media_processing_requested` queue message.
- `POST /internal/media/delete`: validates the same token and publishes a delete message.

The queue consumer handles processing, deletion, and read-time anomaly messages. Processing reloads the Supabase row, verifies R2 existence, byte size, and magic bytes, then persists an idempotent `ready` or `rejected` transition. Queue retries own transient failures; the worker does not acknowledge a failed use case.

The current `BasicImageMediaProcessor` is a technical validator. It does not perform semantic content moderation or generate resized variants. Add either behavior behind the `MediaProcessor` port rather than in HTTP or queue handlers.

## Required deployment configuration

Bindings:

- `R2_BUCKET`
- `MEDIA_QUEUE` producer and consumer

Secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `INTERNAL_WORKER_TOKEN`

Variables:

- `SUPABASE_URL`
- `SUPABASE_JWT_JWKS_URL`
- `MEDIA_ENV`

The matching Supabase secret is `MEDIA_WORKER_INTERNAL_TOKEN`; its value must equal `INTERNAL_WORKER_TOKEN`.

## Development checks

```sh
npm ci
npm run typecheck
npm test
npm run deploy:dry-run
```

Add behavior to the narrowest owner. A new storage provider implements a port; it does not change the use case. A visibility rule changes domain policy and its tests; it does not change HTTP routing. Keep `src/index.ts` stable and tiny.
