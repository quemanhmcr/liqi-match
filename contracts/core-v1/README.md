# Core V1 executable contracts

The TypeScript/Zod modules in this directory are the single executable semantic
authority for the Production Match Loop v1. Types are inferred from runtime
schemas, so provider and consumer code cannot drift from validation semantics.
JSON fixtures are compatibility vectors and are validated by `contracts:check`.

Ownership follows `compatibility-manifest.json`. Identity, lifecycle, profile,
discovery, match, conversation, notification, events, and errors stay in their
bounded files; no second manifest or generated schema tree may redefine them.
Markdown explains decisions only and is not an executable authority.
