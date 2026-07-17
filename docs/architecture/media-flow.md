# Media Flow

## Ownership and states

`public.media_assets` is the authority for media lifecycle. R2 stores bytes; Expo and the Cloudflare Worker never infer a durable state from local UI progress alone.

Supported terminal paths are:

- Profile media: `pending -> ready`
- Chat/report media: `pending -> uploaded -> ready`
- Invalid chat/report media: `pending -> uploaded -> rejected`
- Deletion: `pending|uploaded|ready|rejected -> delete_pending -> deleted`

Profile avatar, cover, and wall assets are auto-approved after the signed R2 HEAD check because they already pass the product's profile-media policy. Chat attachments and report evidence additionally pass asynchronous object-size and magic-byte validation in the media worker.

The current processing policy performs technical validation, not semantic image moderation. Successful technical validation marks private chat/report assets approved. A semantic moderation provider can replace or extend `MediaProcessor` without changing the transport or repository ports.

## Upload and processing

1. Expo calls `media-create-upload` with a Supabase access token and normalized file metadata.
2. The Edge Function validates the JWT, profile existence, purpose, MIME type, and byte size.
3. The function creates a `public.media_assets` row with `pending` status.
4. The function returns a short-lived presigned R2 PUT URL plus required headers.
5. Expo PUTs the file directly to private R2.
6. Expo calls `media-finalize-upload`.
7. The function performs a signed HEAD request to private R2 and checks size and MIME metadata.
8. Profile media is promoted directly to `ready`. Other media moves to `uploaded`.
9. Finalize writes the corresponding outbox facts and calls the authenticated Cloudflare endpoint `POST /internal/media/process`.
10. The endpoint publishes a canonical `media_processing_requested` message to Cloudflare Queue.
11. The queue consumer reloads the authoritative asset, verifies object existence, byte size, and magic bytes, then performs an idempotent `uploaded -> ready` or `uploaded|ready -> rejected` transition.

A queue configuration, network, or enqueue failure returns HTTP 503 **after** the upload transition. This is intentional. Retrying finalize observes `uploaded` and only retries queue publication; it never uploads the file again. The outbox row remains an audit/durability fact and can support a future independent dispatcher.

The mobile upload and profile-gallery flows use the same retry principle. When bytes upload successfully but profile association fails, the UI preserves the asset ID and retries only the association command.

## Profile gallery

The ordered profile wall is stored in `profile_habits.media_summary.wall_media_ids` as four stable slots. Onboarding and Profile Edit use the same parser/updater contract. A cover or wall queue item is complete only after the asset ID has been associated with `profile_habits`; plain `uploaded` is not presented as completion.

This deliberately avoids a separate gallery table while the product only needs four ordered profile images. The JSON contract preserves unrelated summary fields and mirrors `wall_count` and `wall_positions` for compatibility.

## Download

Clients request:

```text
GET /media/:assetId
```

The Cloudflare Worker:

- rejects non-UUID paths;
- loads media metadata from Supabase with a server-side key;
- serves only `ready` and moderation-approved media;
- requires and verifies a Supabase JWT for private visibility;
- checks ownership or conversation membership before reading R2;
- reads from the private R2 binding;
- applies public cache headers only for public media;
- uses `no-store` for private media and report evidence.

Read-time object-missing or magic-byte anomalies are published to the same queue and persisted as `rejected`; they are not merely logged and acknowledged.

## Required server configuration

Supabase Edge Function secrets:

- `MEDIA_WORKER_INTERNAL_URL`: deployed worker origin, without a path.
- `MEDIA_WORKER_INTERNAL_TOKEN`: shared bearer token for internal enqueue requests.
- Existing R2 credentials used by the create/finalize/delete functions.

Cloudflare secrets and bindings:

- `INTERNAL_WORKER_TOKEN`: same value as `MEDIA_WORKER_INTERNAL_TOKEN`.
- `SUPABASE_SERVICE_ROLE_KEY`.
- `R2_BUCKET` binding.
- `MEDIA_QUEUE` producer and consumer binding.

Rotate the shared token in both systems together. It must never use an `EXPO_PUBLIC_*` name or ship in the client bundle.

## Idempotency and failure handling

- Finalize is safe to retry in `uploaded` or `ready`.
- Processing is a no-op for `ready` and `rejected` assets.
- Metadata transitions include asset ID, object key, and expected current status.
- Queue messages are acknowledged only after the use case completes; thrown errors use Cloudflare Queue retries and the configured dead-letter queue.
- Delete remains safe to retry after `deleted` or a previously marked delete.
