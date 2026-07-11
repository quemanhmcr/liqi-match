# Media Worker

The worker is a deployable backend service with inward-pointing dependencies:

```text
index -> worker (composition root)
              |-> transport -> application -> domain
              |-> infrastructure ---------> domain
              `-> platform types
```

- `domain/media`: pure delivery, visibility, and byte-validation policy.
- `application`: use cases and ports; no Cloudflare or Supabase adapter imports.
- `infrastructure`: JWT, Supabase REST, R2, and queue adapters.
- `transport`: HTTP and queue protocol handling.
- `worker`: the only composition root allowed to join transports and adapters.

Add behavior to the narrowest owner. A new storage provider implements a port;
it does not change the use case. A visibility rule changes domain policy and its
tests; it does not change HTTP routing. Keep `src/index.ts` stable and tiny.

Run locally:

```sh
npm ci
npm run typecheck
npm test
npm run deploy:dry-run
```
