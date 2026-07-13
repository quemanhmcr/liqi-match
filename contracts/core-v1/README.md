# Core V1 contracts

`manifest.json` is the executable semantic authority for Mission 1 provider seams.
Generated TypeScript types, Zod runtime schemas, fixtures, and the compatibility
report must never be edited directly.

Run `npm run contracts:generate` after changing the manifest and
`npm run contracts:check` in CI. Markdown explains decisions; it does not define
runtime semantics.
