# Backend Security

## Secret Handling

Client bundle may contain only:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_MEDIA_BASE_URL`

Server-only values:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_JWKS_URL`
- `CLOUDFLARE_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

Set server-only values with `supabase secrets set`, `wrangler secret put`, and CI secret stores. Never put them in Expo config, source files, checked-in env files, or EAS public env.

## RLS

RLS is enabled on all public tables created by the foundation migration. Tables and actions without explicit policies are denied by default. The client cannot directly create matches, conversations, conversation members, or media records for other users.

Do not use `raw_user_meta_data` for authorization. Authorization must come from database state, RLS, SQL functions, or verified JWT subject.

## Cloudflare And Supabase Login Steps

This repository cannot contain your real credentials. A developer must log in and create/link resources. Before linking, print the current project ref and decide whether the workspace link is protected. Prefer an isolated Supabase workdir for staging/production operations rather than relinking a workspace reserved for disposable E2E evidence.

```sh
supabase login
cat supabase/.temp/project-ref
# In an isolated workdir only:
supabase link --project-ref <explicitly-approved-staging-project-ref>
cat supabase/.temp/project-ref
supabase secrets set --env-file .env.staging

wrangler login
wrangler r2 bucket create liqi-match-media-staging
wrangler queues create liqi-match-media-staging
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging
wrangler secret put SUPABASE_JWT_JWKS_URL --env staging
```

Repeat with separate projects, buckets, queues, workers, and secrets for production. Do not use prefixes inside one bucket as a substitute for separate staging and production buckets. Supabase Auth success does not prove the client is using remote application repositories; follow the [environment parity runbook](../runbooks/mobile-backend-environment-parity.md).

## Required Cloudflare R2 Posture

- Bucket is private.
- Public access is disabled.
- Mobile never receives R2 credentials.
- Upload uses presigned PUT only.
- Download goes through the Media Worker custom domain.

## CI Gates

Required checks:

- Expo lint, typecheck, test, and web export smoke test.
- Supabase start/reset/lint/database tests.
- Generated database types diff.
- Worker dependency install, typecheck, tests, and Wrangler dry run.
