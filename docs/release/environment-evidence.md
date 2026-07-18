# Environment release evidence

Source validation and disposable-project database tests do not prove staging or
production readiness. Every release candidate must produce one environment-scoped
JSON artifact based on
`docs/release/evidence/environment-evidence.template.json`.

## Fixed workspace roles

The primary workspace intentionally uses two different Supabase contexts:

- mobile/API runtime: `staging-runtime` → `liqi-match-staging`
  (`wngumhizuxtlhavbpxzy`);
- default linked CLI: `e2e-disposable` → isolated E2E project
  (`ibprkyemsuktfrdpxvza`).

Verify this split with:

```bash
npm run supabase:roles:status
npm run supabase:roles:check
npm run supabase:staging:runtime:check
npm run supabase:e2e:cli:check
```

The default CLI link must not be presented as staging evidence. Staging migration,
RPC, flag, or operational queries must use an isolated Supabase workdir whose
linked ref is `wngumhizuxtlhavbpxzy`. Record that isolated ref as
`targets.remoteOperationProjectRef`.

## Evidence identity

For staging, schema v2 requires all runtime and evidence-bearing operations to
name `liqi-match-staging` and `wngumhizuxtlhavbpxzy`, while separately recording
that the primary workspace's default CLI remains the disposable E2E ref.

The artifact must contain no credentials. Its `artifact` fields should reference
immutable CI jobs, query exports, logs in the approved evidence store, or
change-management records.

Validate a completed artifact with:

```bash
npm run release:evidence:check -- --file <evidence.json>
```

The validator rejects disposable E2E as a runtime/evidence target, cross-project
remote operations, stale evidence, missing two-actor/two-device proof, incomplete
worker or rollback checks, absent approval, and credential-bearing fields.
