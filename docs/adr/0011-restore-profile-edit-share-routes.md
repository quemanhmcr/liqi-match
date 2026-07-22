# ADR 0011: Restore Profile Edit and Share routes

- **Status:** Accepted
- **Date:** 2026-07-21
- **Decision owners:** Profile product and mobile platform

## Context

ADR 0010 reset authenticated routes whose legacy UI was not an approved authority. The Profile read surface has since been rebuilt on `@/shared/ui`, while the tested Profile Edit coordinator, media recovery flow, privacy settings, trust projection and native image export logic remained available behind blank route hosts.

## Decision

Restore `/profile/edit` and `/profile/share` as Profile-owned authorities.

- Both full screens use `AppScreen` and the public `@/shared/ui` API.
- Exact composition values live in Profile-owned recipes.
- Profile Edit keeps the existing canonical read model, dirty-section coordinator, optimistic version handling and recoverable media workflow. UI categories only provide progressive disclosure; they do not merge business save sections.
- Profile Share keeps the privacy gate, authoritative trust projection, PNG capture, media-library save and native share sheet. It fails closed when trust data is unavailable.
- Neither screen mounts `Liqi*` legacy UI or derives social/trust facts from editable legacy statistics.

## Trade-offs

- Edit categories reduce page density, but some fields require one extra tap to reveal.
- Completed-session facts may appear in both social and trust contexts, but each surface retains its own projection authority and no client fallback joins them.
- Export presets increase implementation complexity, but produce predictable social-media dimensions instead of screenshots tied to device density.
