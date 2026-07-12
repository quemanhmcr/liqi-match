# Repository architecture map

This file is the navigation surface for engineers entering the codebase. The repository is organized around explicit ownership, stable public APIs and a managed task lifecycle.

## Before reading implementation code

Run:

```bash
npm run repo:context
```

The command tells you whether the current checkout is the primary review workspace, a managed task worktree, or an unmanaged/publishable checkout. Feature implementation belongs in a managed task worktree created with:

```bash
npm run task:start -- <type/descriptive-name>
```

The complete operating agreement is in [CONTRIBUTING.md](../../CONTRIBUTING.md). The transaction and recovery details are in [worktree workflow](worktree-workflow.md).

## Change ownership map

| Change                                                   | Primary location                                                         | Read before editing                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Route, screen, feature state, client service             | `src/app`, `src/app-shell`, `src/features`, `src/entities`, `src/shared` | [Mobile frontend architecture](mobile-frontend.md)                                                   |
| Test lane, test placement, mocks, providers              | colocated `__tests__`, `src/test`, Jest configs                          | [Testing architecture](testing.md)                                                                   |
| Supabase Edge Function, shared backend kernel, migration | `supabase/functions`, `supabase/migrations`                              | [Backend architecture](backend.md)                                                                   |
| Media authorization, processing or delivery              | `cloudflare/media-worker`                                                | [Backend architecture](backend.md) and [media flow](media-flow.md)                                   |
| Secrets, RLS, service credentials, deployment posture    | backend and platform config                                              | [Security architecture](security.md)                                                                 |
| Task snapshot, overlay, rollback or cleanup behavior     | `scripts/worktree`, `.githooks`, `worktree.config.json`                  | [Worktree workflow](worktree-workflow.md) and [workflow internals](../../scripts/worktree/README.md) |

## Stable dependency direction

```text
route adapters -> feature screens/public APIs -> feature internals
app shell      -> feature public APIs
features       -> entities/shared
entities       -> shared
shared         -> external libraries only
```

Backend adapters follow the same principle: transport and platform entry points call application/domain contracts; domain code does not import deployment SDKs.

Automated architecture checks encode these boundaries. A boundary change requires an architectural decision, documentation update and matching checker update in the same task.

## Default task sequence

```text
repo:context
  -> task:start
  -> read owning architecture document
  -> implement and commit locally
  -> task:check
  -> task:review
  -> primary review
  -> task:finish
```

The package script names are intentionally visible in `package.json`, editor tasks and CI so the workflow can be inferred without a separate prompt or oral handoff.
