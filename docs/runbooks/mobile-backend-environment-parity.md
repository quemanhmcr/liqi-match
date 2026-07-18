# Mobile/backend environment parity

Use this runbook whenever a developer claims that a mobile feature is connected to staging or production. It is deliberately separate from disposable cloud E2E proof.

## 1. Name the target before running anything

Record the project name and sanitized ref. Never infer the target from `.env.local`, a dashboard tab or the current Supabase CLI link.

| Environment                    | Expected ref                        |
| ------------------------------ | ----------------------------------- |
| Staging (`liqi-match-staging`) | `wngumhizuxtlhavbpxzy`              |
| Disposable E2E                 | `ibprkyemsuktfrdpxvza`              |
| Production                     | explicitly approved for the release |

Verify the fixed primary-workspace split first:

```bash
npm run supabase:roles:check
npm run supabase:staging:runtime:check
npm run supabase:e2e:cli:check
```

The default workspace CLI is deliberately E2E-only. For staging remote commands, create or select an isolated Supabase workdir linked to staging and verify its ref before querying.

If the workspace is linked to another protected project, do not casually relink it. Use an isolated Supabase workdir and verify that workdir's ref before querying or changing the target.

## 2. Resolve the mobile runtime without exposing credentials

For staging, start from `.env.staging.example` and place the real publishable value only in ignored local configuration. Required invariants:

```text
EXPO_PUBLIC_APPLICATION_RUNTIME_MODE=api
EXPO_PUBLIC_BACKEND_TARGET=staging-runtime
EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF=wngumhizuxtlhavbpxzy
EXPO_PUBLIC_SUPABASE_URL=https://wngumhizuxtlhavbpxzy.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<real publishable key for the same project>
```

Do not print the key in logs or handoffs. Record only:

```text
runtimeMode=api
backendTarget=staging-runtime
projectRef=wngumhizuxtlhavbpxzy
```

The app must fail closed for remote Supabase plus `simulation`, and for API mode plus the development placeholder key.

## 3. Restart the client boundary

`EXPO_PUBLIC_*` values are embedded into the JavaScript bundle. After any change:

1. stop the existing Metro session;
2. start Metro again, clearing cache when diagnosing environment drift;
3. fully reload or restart the development client;
4. sign in again after changing Supabase projects.

Fast Refresh is not evidence because providers, service singletons, auth storage and TanStack Query caches may already belong to the previous runtime/project. Build or prebuild is required only when native configuration or dependencies changed; coordinate those steps separately.

## 4. Prove migration parity on the named project

Before normal deployment, verify the remote migration list and dry run using the explicitly verified workdir:

```bash
npx --yes supabase@2.109.1 migration list --linked
npx --yes supabase@2.109.1 db push --dry-run --linked
```

Expected steady state:

```text
Remote database is up to date.
```

Stop if versions differ unexpectedly. Never repair history by guesswork. Back up the target, compare the remote migration `name` and SQL content with Git history, and repair only proven-equivalent records. A migration deployed to any shared project is immutable.

## 5. Prove the runtime contract, not only table existence

For every client RPC changed or required by the smoke flow, verify:

- exact function name and argument types/names expected by PostgREST;
- return type;
- `SECURITY DEFINER` posture where intended;
- `authenticated` execution grant and absence of unintended `anon`/`public` grants;
- every private helper, type and table referenced by the function;
- RLS/lifecycle prerequisites for the selected test account.

A public function name existing in `pg_proc` is insufficient if its overload is wrong or a private dependency is missing.

## 6. Record rollout state

Read the relevant authority config tables and record only non-secret flags. Examples include Match reads/writes/emergency stop and Party/Session reads/creation/mutation/reconciliation. Schema parity with writes disabled is an intentionally disabled feature, not a successful integration.

Do not enable broad capabilities merely to make a smoke pass. Follow the owning rollout runbook, use the smallest cohort/window and preserve emergency rollback.

## 7. Run one authenticated walking skeleton

At minimum for the current mobile authority stack:

1. sign in with a real account in the target project;
2. load the own Profile through `resolve_visible_profile_identity_v2` and its downstream Profile reads;
3. read or activate Match Intent when the feature requires it;
4. execute the changed command, such as creating a Session;
5. verify the response contract;
6. verify the row/event/receipt in the same database, or run the smoke inside a transaction that ends with `rollback`;
7. verify retries/idempotency and stale-version rejection when the command supports them;
8. verify sign-out/account switch/route exit prevents late callbacks from mutating the new state.

A simulation-created Session, a mocked repository result or a successful login does not satisfy this step.

## 8. Keep cache and actor identity scoped

Remote query keys and durable auth storage must include enough identity to prevent cross-project and cross-account reuse. For Profile and relationship reads this includes the project ref, canonical viewer PlayerId and target identity. After switching project/account, stale cached data must not be presented as the new authority.

## 9. Handoff format

Use this compact evidence block:

```text
Environment: <name>
Project ref: <sanitized ref>
Runtime mode: api
Migration parity: pass/fail, remote head <version>
RPC/dependency parity: pass/fail, list changed RPCs
Flags: <relevant non-secret values>
Authenticated Profile smoke: pass/fail
Command smoke: persisted / rollback-only / not run
Device full reload: pass/fail
Build/prebuild: not required / performed by <owner>
Known warnings or omitted evidence: <details>
```

Do not combine evidence from multiple project refs into one “backend passed” statement.
