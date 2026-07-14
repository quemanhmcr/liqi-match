# Core V2 contracts

This directory is additive to Core V1. Core V2 imports canonical `AccountId`,
`PlayerId`, lifecycle, and event identity from Core V1 and does not create a
parallel identity authority.

Senior 3 owns the conversation contracts in `conversation/`. Supplier fixtures
under `fixtures/consumer/` describe the generic projection inputs expected from
relationship and session authorities; they do not define those authorities'
state machines.
