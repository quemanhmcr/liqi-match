# Edge Function shared kernel

Only code needed by at least two Edge Functions belongs here.

- `domain/`: pure backend policies and value rules; no Deno environment,
  network, database, or storage imports.
- `infrastructure/`: Supabase, R2, and other external-system adapters.
- `platform/`: transport/runtime primitives such as HTTP responses.

An endpoint owns its request contract and orchestration in its own directory.
Endpoint directories never import one another. Keep `index.ts` as a deployment
adapter only and put behavior in `handler.ts` or smaller endpoint-owned modules.
