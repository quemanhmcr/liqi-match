## Change

Describe the owned problem and the resulting behavior.

## Architecture

- [ ] The change stays within the documented ownership and dependency boundaries.
- [ ] A new boundary or convention includes its documentation and automated checker update.
- [ ] No secrets, generated native projects or local runtime artifacts are included.

## Design language

- [ ] This change has no mobile visual impact, or it follows `DESIGN.md` and the Home- and Messages-derived shared UI language.
- [ ] New/materially changed UI imports from `@/shared/ui` or an owned recipe; component implementations add no raw color literals or removed effect vocabulary.
- [ ] Every full screen uses `AppScreen`, or an embedded/modal host has the required reason marker.
- [ ] Compact and regular widths, 44 dp targets, accessibility labels and loading/error/empty/disabled/pressed states were considered.
- [ ] UI-affecting changes include compact and regular-width evidence, or the omission is explained below.
- [ ] No checksum in the legacy UI baseline was refreshed to bypass migration.
- [ ] A canonical token/primitive change includes design documentation, checker updates and focused tests.

## Validation

- [ ] `npm run task:check` passed, or omitted lanes are explained below.
- [ ] Relevant device, emulator, Supabase or Worker validation is recorded when applicable.
- [ ] Tests were added or updated beside the owning feature/service.
- [ ] Any staging/production claim names the sanitized project ref and proves `api` runtime, migration parity, RPC/dependency parity and rollout flags on that same project.
- [ ] Auth success, simulation tests or disposable E2E results are not presented as evidence for another environment.
- [ ] Public environment changes include a full-reload/re-authentication smoke note.

## Handoff

- [ ] The review diff comes from a clean task or publishable branch.
- [ ] The branch does not contain a `Liqi-Snapshot: true` ancestor or `refs/liqi/*` metadata.
- [ ] Rollout, migration, compatibility and rollback notes are included when applicable.

### Notes / intentionally omitted validation

None.
