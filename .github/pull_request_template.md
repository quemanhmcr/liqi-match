## Change

Describe the owned problem and the resulting behavior.

## Architecture

- [ ] The change stays within the documented ownership and dependency boundaries.
- [ ] A new boundary or convention includes its documentation and automated checker update.
- [ ] No secrets, generated native projects or local runtime artifacts are included.

## Validation

- [ ] `npm run task:check` passed, or omitted lanes are explained below.
- [ ] Relevant device, emulator, Supabase or Worker validation is recorded when applicable.
- [ ] Tests were added or updated beside the owning feature/service.

## Handoff

- [ ] The review diff comes from a clean task or publishable branch.
- [ ] The branch does not contain a `Liqi-Snapshot: true` ancestor or `refs/liqi/*` metadata.
- [ ] Rollout, migration, compatibility and rollback notes are included when applicable.

### Notes / intentionally omitted validation

None.
