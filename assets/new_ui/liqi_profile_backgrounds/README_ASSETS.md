# LiQi Profile artwork assets

Master artwork supplied for the Profile rebuild:

- `profile_playstyle_creative_1200x1600.png`
- `profile_playstyle_rhythmkeeper_1200x1600.png`
- `profile_playstyle_finisher_1200x1600.png`
- `profile_memory_sleepless_night_1800x900.png`

Mobile runtime derivatives are intentionally smaller and shadow-lifted so the
art remains visible behind semantic text overlays on Android displays:

- `profile_playstyle_creative_mobile.jpg` — 720×960
- `profile_playstyle_rhythmkeeper_mobile.jpg` — 720×960
- `profile_playstyle_finisher_mobile.jpg` — 720×960
- `profile_memory_new_warrior_mobile.jpg` — 1440×720, system-owned starter milestone derived from the 2:1 memory master without cropping

The starter milestone and Admin LiQi welcome copy are presentation-owned system
content. They must never be counted as user media, peer endorsements, or trust
evidence.

Runtime frames preserve the authored aspect ratios: play-style artwork uses 3:4 and memory banners use 2:1. Do not reintroduce fixed heights that force `cover` to crop these system assets.

## Runtime framing contract

The mobile derivatives preserve the masters' authored composition and aspect
ratio; they are not crop fixes. Profile renders them through the Profile-owned
`ProfileArtwork` component:

- an ambient `cover` layer fills the rounded frame;
- the visible composition uses `contentFit="contain"`;
- bundled play-style and starter artwork use documented safe insets;
- user media keeps the entire source composition and uses the ambient layer to
  avoid hard letterbox bars;
- remote sources use `memory-disk` caching and a stable recycling key.

Do not replace this contract with `cover` on the authoritative foreground. If
a future master is already cropped too tightly, create a new authored derivative
rather than compensating with an undocumented runtime zoom or translation.

## Play-style archetype pack

Profile now resolves exactly three semantic facets from canonical habit IDs:
`goal`, `coordination`, and `tactics`. The runtime registry uses 720×960 JPEG
derivatives; the 1200×1600 PNG files remain authored masters. Rank, lane, role,
and array order are not artwork-selection signals.

The AI pack supplied on 2026-07-22 contains 14 fully decodable masters and one
malformed source: `profile_playstyle_tactics_objective_control_1200x1600.png`
ends after scanline 1220 of 1600. It remains only inside the incoming ZIP and is
not bundled. Objective-control currently fails closed to the neutral tactics
artwork through `profile-screen-assets.ts`; replacing that one source and its
mobile derivative requires no presenter change.

Do not bundle files from `incoming_ai_pack/`. It is an intake location, not a
runtime asset registry.
