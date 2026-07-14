# Core V1 executable contracts

This directory is the single executable semantic authority for Production Match
Loop v1.

Shared identity, lifecycle, profile, discovery, match, notification, event, and
error contracts are TypeScript/Zod modules. Types are inferred from runtime
schemas so provider and consumer validation cannot drift.

The conversation bounded context uses JSON Schema under `conversation/` and its
conversation-owned event schemas. Its generated TypeScript/Zod transport
artifacts live under `src/features/messages/contracts/generated`. Cross-mission
events such as match bootstrap and notification remain owned by
`events/events.ts`; a bounded generator must not redefine them.

JSON fixtures are compatibility vectors validated by `contracts:check`.
Ownership follows `compatibility-manifest.json`. Markdown explains decisions but
never overrides executable contracts.
