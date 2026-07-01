# Media Flow

## Upload

1. Expo calls `media-create-upload` with a Supabase access token and normalized file metadata.
2. The Edge Function validates the JWT, profile existence, purpose, MIME type, and byte size.
3. The function creates a `public.media_assets` row with `pending` status.
4. The function returns a short-lived presigned R2 PUT URL plus required headers.
5. Expo PUTs the file directly to private R2.
6. Expo calls `media-finalize-upload`.
7. The function performs a signed HEAD request to private R2 and checks size and MIME metadata.
8. The function moves the asset to `uploaded` and enqueues outbox events.
9. Async processing/moderation later moves approved media to `ready`.

The first phase intentionally does not proxy file bytes through Supabase and does not perform server-side resizing.

## Download

Clients request:

```text
GET /media/:assetId
```

The Cloudflare Worker:

- Rejects non-UUID paths.
- Loads media metadata from Supabase with a server-side key.
- Serves only `ready` and moderation-approved media.
- Requires and verifies a Supabase JWT for private visibility.
- Checks ownership or conversation membership before reading R2.
- Reads from the private R2 binding.
- Applies public cache headers only for public media.
- Uses `no-store` for private media and report evidence.

The Worker includes a `MediaProcessor` interface and a basic magic-byte validator. This is the intended extension point for Cloudflare Images, a moderation provider, or richer validation later.

## Idempotency

Create/finalize/delete endpoints are designed around state transitions:

- `pending -> uploaded -> ready`
- `pending/uploaded/ready/rejected -> delete_pending -> deleted`

Finalize is safe to retry after `uploaded` or `ready`. Delete is safe to retry after `deleted` or a previously marked delete. Consumers of `private.outbox_events` must also be idempotent.
