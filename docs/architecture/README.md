# Repository architecture map

This file is a navigation surface for engineers entering the codebase. The repository is organized around explicit ownership and stable public APIs; checkout strategy is chosen according to the task.

## Before reading implementation code

Run:

```bash
npm run repo:context
```

The command tells you whether the current checkout is primary, a managed task worktree or an unmanaged/publishable checkout. Use that information to choose a normal Git worktree, a managed snapshot worktree or another isolated checkout. The managed option is:

```bash
npm run task:start -- <type/descriptive-name>
```

General contribution guidance is in [CONTRIBUTING.md](../../CONTRIBUTING.md). Every mobile UI change also starts with the [LiQi UI contract](../../DESIGN.md). Worktree choices, transaction details and recovery notes are in the [worktree toolbox](worktree-workflow.md).

## Change ownership map

| Change                                                   | Primary location                                                         | Read before editing                                                                                                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Route, screen, feature state, client service             | `src/app`, `src/app-shell`, `src/features`, `src/entities`, `src/shared` | [Mobile frontend architecture](mobile-frontend.md)                                                                                                                                               |
| Mobile visual language, recipes, primitives, new screens | `DESIGN.md`, `src/shared/ui`, feature/app-shell `*-ui.ts` recipes        | [LiQi UI contract](../../DESIGN.md), [usage and route rebuild playbook](../development/SHARED_UI_AND_ROUTE_REBUILD_PLAYBOOK.md) and [full design specification](../design/LIQI_DESIGN_SYSTEM.md) |
| Test lane, test placement, mocks, providers              | colocated `__tests__`, `src/test`, Jest configs                          | [Testing architecture](testing.md)                                                                                                                                                               |
| Supabase Edge Function, shared backend kernel, migration | `supabase/functions`, `supabase/migrations`                              | [Backend architecture](backend.md)                                                                                                                                                               |
| Media authorization, processing or delivery              | `cloudflare/media-worker`                                                | [Backend architecture](backend.md) and [media flow](media-flow.md)                                                                                                                               |
| Secrets, RLS, service credentials, deployment posture    | backend and platform config                                              | [Security architecture](security.md) and [environment parity runbook](../runbooks/mobile-backend-environment-parity.md)                                                                          |
| Task snapshot, overlay, rollback or cleanup behavior     | `scripts/worktree`, `.githooks`, `worktree.config.json`                  | [Worktree workflow](worktree-workflow.md) and [workflow internals](../../scripts/worktree/README.md)                                                                                             |

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

## Example reasoning sequence

```text
understand the task and current checkout
  -> identify ownership and nearby concurrent work
  -> choose the lightest recoverable checkout strategy
  -> read the relevant architecture context
  -> implement and run proportionate checks
  -> review on the surface that exposes the real risks
  -> publish or hand off with clear history and validation notes
```

Managed `task:*` scripts and editor tasks remain discoverable for work that benefits from their snapshot, overlay and archive features. They are tools within this reasoning process, not the process itself.
