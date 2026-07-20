# LiQi shared UI system

**Version:** 1.0.0  
**Golden references:** production Home and Messages experiences approved in July 2026.  
**Repository entry point:** [`DESIGN.md`](../../DESIGN.md)

## Direction

LiQi is a dark, intimate gaming-social product. The current language uses a near-black navy canvas, dark near-opaque content surfaces, sharp fantasy artwork, restrained violet-to-pink energy gradients and high-contrast typography. Hierarchy comes from content, spacing, artwork, semantic surfaces and selective emphasis—not backdrop blur or decorative effect stacks.

The system must remain readable below 390 dp without shrinking interactive targets below 44 dp.

## Architecture and ownership

```text
src/shared/ui/
  index.ts                         public API
  theme/app-theme.ts               semantic foundation
  internal/component-recipes.ts    reusable primitive recipes
  App*.tsx                         shared behavior contracts

src/features/<feature>/ui/<feature>-ui.ts
src/app-shell/<area>/<area>-ui.ts  owned feature/app-shell recipes
```

New product code imports from one module:

```ts
import {
  AppButton,
  AppCard,
  AppScreen,
  AppText,
  appColors,
  appSpacing,
  isCompactViewport,
} from '@/shared/ui';
```

Deep imports into `@/shared/ui/*` are forbidden. The old `Liqi*` and `liqi-design-system` modules are compatibility adapters for untouched routes, not new examples.

### What belongs in shared UI

A shared primitive owns reusable behavior and accessibility:

- `AppScreen` and `AppBackground`
- `AppSurface` and `AppCard`
- `AppButton`, `AppIconButton` and `AppChip`
- `AppText`, `AppSectionHeader` and `AppIdentityHeader`

### What stays feature-owned

Feature components own domain semantics and data shape:

- Home activity cards and match/session compositions;
- inbox conversation rows and unread/delivery accessories;
- message bubbles, media states, receipts and composer behavior;
- artwork selection rules tied to relationship/source contracts.

Visual similarity alone is not sufficient reason to move a component into shared.

## Recipe policy

Component implementations contain no raw color literals. Exact values live in:

- `app-theme.ts` when they represent product-wide semantic roles;
- `component-recipes.ts` when they define a reusable primitive;
- `<feature>-ui.ts` when they belong to one feature composition.

A recipe is a named ownership boundary, not a dumping ground. Promote a feature value to shared only after a second real consumer uses the same semantic role.

## Typography

`AppText` defines the semantic hierarchy:

| Variant     | Intended role                   |
| ----------- | ------------------------------- |
| `display`   | Home-style hero display         |
| `h1`        | screen title                    |
| `h2`        | card/major block title          |
| `h3`        | section title                   |
| `body`      | primary explanatory copy        |
| `bodySmall` | compact secondary copy          |
| `label`     | control/meta label              |
| `caption`   | timestamp and tertiary metadata |
| `button`    | button copy                     |

Use at most three hierarchy levels inside a card. Do not add arbitrary sizes to solve layout problems; fix composition or add a reviewed semantic role.

## Surface and control contracts

### `AppSurface`

- `surfaceTone` controls visual density;
- `emphasis` controls shadow emphasis;
- borders express separation, not decoration;
- `backgroundSlot` allows owned artwork or gradients;
- `withHighlight` is restrained and hierarchy-driven.

### `AppButton`

- preserves at least a 44 dp target;
- provides semantic variants and disabled/pressed behavior;
- supports owned gradient overrides only when the feature recipe defines them;
- does not authorize a command merely because a button is visible.

### `AppChip`

- owns selection/disabled/accessibility semantics;
- may receive an owned selected gradient;
- must not use sheen or glass treatment where the product recipe calls for an opaque filter.

### `AppIdentityHeader`

- owns Home-approved identity/page geometry and icon action behavior;
- copy, avatar, indicators and navigation callbacks remain supplied by the feature;
- page and identity presentation are explicit contracts.

## Home composition

Home owns `homeUi` and its feature components. Shared UI provides primitives only. The Home hero remains 272 dp high; compact behavior adjusts internal spacing/type rather than changing the product invariant. Readiness, matching and session commands remain authoritative and are not inferred from artwork.

`HomeRecentActivityCard` is feature-owned because its image, MVP badge and activity metadata are Home semantics, even though it composes shared typography and interaction rules.

## Messages and conversation composition

Messages owns `messagesUi`, `ConversationCard`, message bubbles and composer/timeline components.

- `MessagesScreen` composes `AppIdentityHeader`, filters and feature-owned conversation rows.
- `ConversationCard` owns relationship artwork, unread hierarchy and delivery accessories.
- artwork is presentation-only and never invents participants, presence, unread counts or capabilities;
- play-session banners render only from authoritative `source.type === 'play_session'` data;
- `ChatComposerDock` remains the sole safe-area/IME owner;
- media retry, queueing, read-only state and sending behavior remain transport/capability-driven.

## Responsive and accessibility rules

- compact viewport: below 390 dp;
- regular viewport: 390 dp and above;
- minimum target: 44 dp or equivalent hit slop;
- icon-only actions require accessibility labels;
- status must not rely on color alone;
- loading, error, empty, disabled, pressed, queued and retry states must be explicit where applicable;
- compact mode reduces chrome before readability.

## Enforcement

- `npm run design:new-screen -- <feature> <PascalCaseName>` generates `App*` code and a native test;
- `npm run design-system:self-test` validates the scanner rules;
- `npm run design-system:check` validates imports, screen hosts, recipes, raw colors, composition contracts and legacy checksums;
- pre-commit, architecture checks and CI treat governance as a release gate;
- `config/design-system-legacy-baseline.json` may shrink only through migration.

A design-system change is complete only when implementation, governance, docs and focused tests agree.
