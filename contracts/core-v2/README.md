# Core V2 contracts

This directory is additive to Core V1. Core V2 imports canonical `AccountId`,
`PlayerId`, lifecycle, correlation, idempotency, and event identity from Core V1
and does not create a parallel identity authority.

Semantic ownership remains explicit:

- Senior 1 owns social relationships, privacy, block, mute, and report state.
- Senior 2 owns party and play-session lifecycle.
- Senior 3 owns conversation, membership projection, message delivery, read state,
  notification delivery policy, and communication evidence.
- Senior 4 owns completed-session outcomes, endorsements, reputation facts,
  repeat-play derivation, activity eligibility, engagement preferences, and
  frequency caps.

Consumer fixtures describe projection inputs expected from another authority;
they never redefine the supplier state machine. Public reputation remains
capability-gated by the social/privacy provider. Trust and activity facts never
grant conversation or session authorization.
