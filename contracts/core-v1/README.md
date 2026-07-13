# Core V1 contracts

Machine-readable sources in this directory are the executable semantic authority.
Markdown explains decisions but never overrides executable contracts.

- `manifest.json` owns Mission 1 identity and lifecycle provider seams. Its generated
  TypeScript, Zod fixtures, and compatibility report live under
  `src/shared/contracts/core-v1` and `contracts/core-v1/generated`.
- `identity/`, `lifecycle/`, `profile/`, `discovery/`, `match/`, `events/`, and
  `errors/` contain shared provider-owned TypeScript/Zod contracts.
- `conversation/*.schema.json` and Conversation-owned event schemas generate
  TypeScript and Zod artifacts under
  `src/features/messages/contracts/generated`.

Run `npm run contracts:generate` after changing an executable source and
`npm run contracts:check` in CI.
