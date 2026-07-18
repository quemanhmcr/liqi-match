# ADR 0008: Client/backend environment authority

- Status: accepted
- Date: 2026-07-17

## Context

Liqi Match has deep Supabase authority for identity, lifecycle, matching, conversation, social safety, Party/Session and trust outcomes. A previous development configuration allowed Supabase Auth to use a remote project while application repositories remained in simulation. Separately, the disposable cloud E2E project advanced beyond staging, and migration-history renumbering left staging without RPCs and private dependencies expected by the client.

This produced a split-brain system: login succeeded, simulation UI flows succeeded and cloud database suites succeeded, yet the running app did not persist Profile/Match/Session behavior to the intended staging database.

## Decision

1. Runtime mode and app variant are independent, explicit authorities.
2. `simulation` may use only local Supabase hosts. Every remote Supabase project requires `api` mode and a real publishable key. Invalid combinations fail during environment parsing.
3. Auth connectivity is not application-backend evidence. Profile, Match, Conversation, Social and Party/Session repositories must be verified through their real remote contracts.
4. Environment evidence is project-scoped. The disposable E2E project, staging and production are different targets; results are never transferable between them.
5. Query/cache identity that can cross projects or actors includes the sanitized project ref and canonical actor identity. Late callbacks from an old account, route or project may not update current state.
6. Shared migrations are immutable. Once deployed, they are never edited, renamed or renumbered. Corrections use later reconciliation migrations.
7. Migration-history repair requires a backup and proof that the remote migration name/SQL is equivalent to the canonical record. Different SQL is never marked applied merely to restore CLI parity.
8. A staging/production integration claim requires runtime identity, migration parity, RPC signature/dependency parity, grants, rollout flags and an authenticated persisted-or-rollback smoke on the same project.
9. Changing any `EXPO_PUBLIC_*` value requires a Metro restart/full reload. Changing Supabase projects also requires re-authentication because tokens and auth storage are project-scoped.

## Project roles

| Project              | Ref                             | Role                                                   |
| -------------------- | ------------------------------- | ------------------------------------------------------ |
| `liqi-match-staging` | `wngumhizuxtlhavbpxzy`          | staging mobile/API behavior and persisted staging data |
| disposable cloud E2E | `ibprkyemsuktfrdpxvza`          | isolated SQL/RPC evidence only                         |
| production           | explicitly approved per release | production behavior only                               |

The current Supabase CLI link does not choose the product environment. Every remote operation prints and verifies the target ref first; operations on a second project use an isolated CLI workdir where practical.

The version-controlled registry `config/supabase-projects.json` is the canonical identity source. `staging-runtime` is the only registered non-production mobile target. `e2e-disposable` is rejected by the mobile environment parser and accepted only by E2E/review entrypoints. The primary workspace intentionally keeps `.env.local` on staging and its default Supabase CLI link on E2E.

## Required release evidence

A release or handoff that claims remote behavior records:

- source commit/checkpoint;
- runtime mode and sanitized project ref resolved by the bundle;
- remote migration head and dry-run parity;
- exact client RPC signatures, grants and required private helpers;
- relevant rollout flags and emergency stops;
- authenticated Profile read;
- changed command path and persisted database record, or explicit rollback-only evidence;
- full-reload/device result;
- intentionally omitted evidence and why.

## Consequences

Local simulation remains fast and deterministic, but it cannot masquerade as cloud integration. Cloud pgTAP remains valuable, but its result is tied to its project. Staging/production work has a slightly longer evidence checklist, in exchange for preventing a sophisticated backend from becoming disconnected from the client that is supposed to use it.
