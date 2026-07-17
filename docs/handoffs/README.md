# Handoff evidence

Documents in this directory are historical, project-scoped evidence. They are not evergreen deployment runbooks and must not be used to infer the current state of another Supabase project.

Before reusing a command or conclusion from a handoff:

1. read its date and explicit project ref;
2. verify whether it used local, disposable E2E, staging or production infrastructure;
3. confirm current migration parity, RPC/dependency parity and rollout flags on the intended target;
4. run the current authenticated smoke from `docs/runbooks/mobile-backend-environment-parity.md`.

A statement such as `Remote database is up to date` applies only to the project named in that evidence at that time.
