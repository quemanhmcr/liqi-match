# Mobile frontend architecture

## Intent

The application is organized so a feature team can own a page without editing
another feature, the root navigator, or the persistent tab bar. Expo Router
files describe URL-to-feature composition only; product UI and business logic
live outside the router tree.

## Source tree and ownership

```text
src/
  app/                         # Expo Router adapters and nested layouts only
    (public)/                  # public preview
    (onboarding)/              # authenticated, incomplete-profile flow
    (app)/                     # authenticated, complete-profile flow
      (tabs)/                  # sole persistent primary-tab navigator
      profile/                 # stack routes above the tab navigator
  app-shell/                   # provider composition, route policy, primary nav
  features/
    <feature>/
      index.ts                 # optional lightweight cross-layer API
      screens/ components/ model/ services/ data/
  entities/                    # shared product concepts, currently hero catalog
  shared/                      # reusable UI primitives and generic infrastructure
  test/                        # Jest platform setup and render helpers only
```

| Area                                         | Owner                    | Change policy                                                            |
| -------------------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| `src/app-shell/**`, `src/app/**/_layout.tsx` | platform/app-shell owner | Small dedicated PR; review navigation and access-policy contracts.       |
| `src/features/<name>/**`                     | named feature owner      | Feature work stays here, including its screens, data, service and tests. |
| `src/entities/**`                            | domain owner             | Add only concepts used by at least two features.                         |
| `src/shared/**`                              | platform owner           | Add only reusable primitives/infrastructure, never feature logic.        |

`src/app` must remain thin. A leaf route imports exactly one feature screen
surface from `features/<feature>/screens/` and renders it. App-shell imports a
feature's lightweight `index.ts` only when it needs a cross-layer domain API.
This prevents an app-shell access check from eagerly importing every screen in a
feature. Route adapters never contain screen UI, hooks, service calls, or
feature-local data. Root and group layouts never manually list individual
screens, so adding a normal route does not create a central-file conflict.

## Navigation contract

Routes remain URL-compatible with the former app:

| URL                                                                           | Area                | Responsibility                        |
| ----------------------------------------------------------------------------- | ------------------- | ------------------------------------- |
| `/`                                                                           | root public adapter | Login                                 |
| `/preview`                                                                    | public              | Explicit unauthenticated Home preview |
| `/profile-setup` … `/profile-media`                                           | onboarding          | Six-step onboarding flow              |
| `/home`, `/explore`, `/messages`, `/profile`                                  | app tabs            | Persistent primary tabs               |
| `/profile/[userId]`, `/profile/edit`, `/profile/share`, `/profile/settings/*` | app stack           | Detail and profile flows above tabs   |

`MAIN_TABS` in `src/app-shell/navigation/main-tabs.ts` is the only primary-tab
contract. `MainTabsLayout` uses Expo Router `Tabs` with lazy loading and
`freezeOnBlur`; tab changes use navigator semantics rather than `router.push`,
so tab history does not grow a Home/Profile stack. `LiquidBottomNav` remains a
presentation primitive and is never rendered by a page.

`RouteAccessGate` owns session/onboarding decisions for public, onboarding and
app areas. It makes deep links follow the same policy as OAuth returns. The
public preview is explicit so `/home` can remain protected without removing the
existing preview behavior.

## Dependency rules

```text
app              -> feature screen surfaces -> entities -> shared
app-shell        -> lightweight feature public APIs -> entities -> shared
features         -> entities, shared, app-shell/navigation/routes only
shared           -> shared only
```

- A feature never imports another feature.
- `Hero` is an entity, not onboarding data.
- Generic media transport is in `shared/services`; onboarding-specific avatar
  association stays in onboarding.
- Home preview fixtures belong to Home, not Profile.
- Only `app-shell/navigation/routes.ts` is a permitted app-shell import from a
  feature; it is the stable URL contract.

`npm run architecture:check` resolves alias and relative static imports, dynamic
imports and `require()` calls. It rejects boundary violations, deep feature
imports from app/app-shell, UI-heavy route adapters, tests in `src/test`, and
manual `Stack.Screen` registrations in `src/app` layouts. It is a CI gate.

## Adding work safely

### A normal page in an existing feature

1. Add its screen, components, data and service inside
   `src/features/<feature>/`.
2. Add one thin adapter in the correct existing route group that imports that
   screen surface. No root layout
   change is needed.
3. Add a colocated feature test that imports the feature screen/service directly,
   never a route file.
4. Run the required quality gates.

### A new feature

Create `screens/`, `components/`, `model/`, `services/`, `data/` only as they
are needed. Keep `index.ts` deliberately small and limited to APIs that the
shell or another allowed layer truly needs; do not barrel-export all screens.
If a concept is genuinely shared by two features, propose an entity/shared
extraction in a separate platform PR instead of importing across feature
folders.

### A new primary tab

This is intentionally a shell contract change: add the feature route, then add
one descriptor to `MAIN_TABS` and update its contract test. The app-shell owner
reviews it because tab order, URLs and accessibility are product-wide behavior.

## Parallel-development workflow

Treat the primary workspace as review/integration only. Each task starts from a
small branch (for example `feature/discover-filters`) and, when concurrent work
is local, its own Git worktree. Feature PRs should change only their feature
folder plus new route adapters/tests. Shell, entity and shared changes are
separate, small PRs with their owners as reviewers.

Use a protected integration branch or `main` with required CI checks; do not
combine visual feature work with tab-shell, shared-token, or dependency-boundary
changes. Rebase feature branches before integration, and use `npm run
start:clear` or `npm run dev:android:cold` when Metro/emulator state is stale.

## Tests and checks

- Feature tests are colocated under `src/features/<feature>/__tests__`.
- Shell tests live under `src/app-shell/**/__tests__` and protect the access
  matrix plus primary-tab keys, order, URLs and accessibility behavior.
- `src/test/render-with-providers.tsx` provides explicit deterministic auth and
  query state; global setup contains only platform mocks.

Run before handoff:

```bash
npm run format:check
npm run architecture:check
npm run lint
npm run typecheck
npm run test:ci
npx expo export --platform web
```

## Follow-up boundaries

The large existing Profile edit/share/settings screens are now isolated to the
Profile feature, so they no longer create cross-team conflicts. Split them into
feature-local section components/model hooks when multiple people begin working
on the same Profile flow; do not move those pieces to `shared` preemptively.
Device E2E coverage for the access/deep-link matrix is the next production
testing layer after the development client is available in CI.
