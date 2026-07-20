# LiQi UI contract

Every new or materially changed mobile UI surface uses the **Home- and Messages-derived shared UI language**. This is a repository contract, not an optional visual preference.

## Start here

```bash
npm run design:new-screen -- <feature> <PascalCaseName>
npm run design-system:check
```

The scaffold creates an `AppScreen` and a colocated native test. It intentionally contains `TODO(design-scaffold)`, so validation stays red until placeholder composition is replaced with authoritative feature state.

For concrete imports, ownership rules and the route reactivation workflow, read the [shared UI and route rebuild playbook](docs/development/SHARED_UI_AND_ROUTE_REBUILD_PLAYBOOK.md).

## Non-negotiable rules

1. **Home and Messages are reference authorities, not copy-paste templates.** Reuse their hierarchy, density, interaction treatment, state visibility and compact behavior. Do not copy a feature-specific layout into unrelated pages.
2. **Use one public API.** New code imports primitives and semantic values from `@/shared/ui`. Deep imports into `@/shared/ui/*` are forbidden.
3. **Keep ownership explicit.** Reusable behavior belongs in `src/shared/ui`. Feature-only visual decisions belong in `src/features/<feature>/ui/<feature>-ui.ts` (or an app-shell `*-ui.ts` recipe), not in shared tokens.
4. **No component-local palette.** Hex/RGB/HSL literals are allowed only in owned recipe/theme files. Components consume semantic values from `@/shared/ui` or their owned recipe.
5. **Every full screen has an explicit host.** Use `AppScreen`. A genuinely embedded or modal screen must declare `// liqi-screen-host: embedded -- <reason>` or `// liqi-screen-host: modal -- <reason>`.
6. **Use semantic typography.** `AppText` provides `display`, `h1`, `h2`, `h3`, body, label, caption and button roles. Do not create a parallel font scale.
7. **Design compact and regular widths together.** Preserve the 44 dp minimum target, readable type, loading/error/empty/disabled/pressed states and icon accessibility labels.
8. **Visual work never replaces domain authority.** Repositories, commands, permissions, navigation and server state remain the source of truth.
9. **No previous material system.** Backdrop blur, liquid/glass terminology, effect-intensity props, custom edge glow and path-based effects are forbidden.

## Shared versus feature components

Shared UI is intentionally small:

- `AppScreen`, `AppBackground`
- `AppSurface`, `AppCard`
- `AppButton`, `AppIconButton`, `AppChip`
- `AppText`, `AppSectionHeader`, `AppIdentityHeader`

Feature semantics stay with the feature. Examples include `HomeRecentActivityCard`, `ConversationCard`, message bubbles, delivery receipts and the chat composer. A component does not become shared merely because it looks like a card or button.

## Existing UI and touch-to-migrate

`src/shared/components/liqi`, `src/shared/layouts/LiqiScreen` and `src/shared/theme/liqi-design-system` are temporary compatibility surfaces for routes that have not migrated. New code must not import them.

Older UI debt is frozen in `config/design-system-legacy-baseline.json`. A new non-compliant file fails immediately; editing a baseline file requires migration and removal of its entry. Do not refresh a checksum to bypass migration.

## Changing the UI system

A UI-system change updates one coherent decision:

- semantic shared theme or an owned feature recipe;
- a shared primitive only when behavior is genuinely reusable;
- `docs/design/LIQI_DESIGN_SYSTEM.md` and the relevant ADR;
- governance/scaffold code when the public contract changes;
- focused behavior, accessibility and governance tests.

Run formatting, lint, typecheck, design governance, architecture checks and related native/unit tests before integration.
