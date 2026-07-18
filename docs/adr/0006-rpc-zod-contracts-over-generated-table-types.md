# ADR 0006: RPC and Zod contracts over generated table types

## Status

Accepted.

## Context

The mobile runtime does not own the database schema and does not query Core V1 or Core V2 aggregate tables directly. Public RPC functions are the production boundary. Their request and response payloads are validated by versioned Zod contracts and repository adapters.

A committed `database.types.ts` previously represented only an older schema snapshot. It was unused by application code and could imply type coverage for newer Core V2 tables and RPCs that it did not contain.

## Decision

- Production application code uses validated RPC repositories and versioned contracts.
- Generated Supabase table types are diagnostic artifacts only.
- `npm run supabase:types` writes to `.artifacts/supabase/database.types.ts`, which is ignored by Git.
- No production file may import generated database types or call `supabase.from(...)` directly.
- `npm run rpc-contract-strategy:check` enforces these rules.

## Consequences

RPC contract changes require an explicit schema/adapter update and tests. Local table-type generation remains available for database investigation, but it is not a substitute for the public API contract and cannot silently become an application dependency.
