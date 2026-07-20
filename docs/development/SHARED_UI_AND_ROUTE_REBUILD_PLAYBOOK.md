# Shared UI and route rebuild playbook

Use this guide when creating mobile UI, changing Home or Messages, or rebuilding one of the authenticated product routes that is intentionally blank.

## Current product authority

The mounted product UI authorities are:

- Home: `src/features/home/screens/HomeDashboardScreen.tsx`
- Messages inbox: `src/features/messages/screens/MessagesScreen.tsx`
- Conversation: `src/features/messages/screens/ChatConversationScreen.tsx`

Authentication, OAuth callback and onboarding remain mounted because they are application bootstrap and lifecycle boundaries. All other authenticated product routes are classified by `src/app-shell/navigation/__tests__/route-reset-policy.test.ts` and currently mount `ResetRouteScreen` until their frontend is rebuilt.

A blank route does **not** mean its backend or domain feature was removed. Repositories, commands, contracts, permissions, deep links and route URLs remain authoritative unless a separate architecture change explicitly changes them.

## Import from one public UI API

New and materially changed UI imports from `@/shared/ui` only:

```tsx
import {
  AppButton,
  AppCard,
  AppScreen,
  AppSectionHeader,
  AppText,
  appSpacing,
  isCompactViewport,
} from '@/shared/ui';
```

Do not deep-import `@/shared/ui/*`. Do not add new imports from:

```text
@/shared/components/liqi
@/shared/layouts/LiqiScreen
@/shared/theme/liqi-design-system
```

Those modules are compatibility adapters for untouched legacy source. The removed `liquid`, glass, blur and glow APIs must not return.

## Shared UI versus feature ownership

Put a component in `src/shared/ui` only when it owns reusable behavior or accessibility that has multiple real consumers. Current shared primitives are:

- `AppScreen`, `AppBackground`
- `AppSurface`, `AppCard`
- `AppButton`, `AppIconButton`, `AppChip`
- `AppText`, `AppSectionHeader`, `AppIdentityHeader`

Keep product semantics inside the owning feature. Examples:

- `HomeRecentActivityCard` belongs to Home.
- `ConversationCard`, message bubbles, delivery states and the composer belong to Messages.
- Artwork selection based on a relationship or source contract belongs to that feature.

Visual similarity is not enough reason to move a component into shared UI.

## Theme and recipe ownership

Use product-wide semantic values from `@/shared/ui`:

```tsx
import { appColors, appRadii, appSpacing } from '@/shared/ui';
```

Feature-only values live in a named recipe module:

```text
src/features/<feature>/ui/<feature>-ui.ts
src/app-shell/<area>/<area>-ui.ts
```

Components must not contain hex, RGB or HSL literals. Exact values belong in:

- `src/shared/ui/theme/app-theme.ts` for product-wide semantic roles;
- `src/shared/ui/internal/component-recipes.ts` for reusable primitive behavior;
- a feature/app-shell recipe for one owned composition.

Promote a feature value to shared only after another real consumer uses the same semantic role.

## Typography

Use `AppText` instead of creating a local font scale:

```tsx
<AppText variant="h1">Tên màn hình</AppText>
<AppText tone="secondary" variant="body">
  Nội dung giải thích.
</AppText>
<AppText variant="caption">Vừa xong</AppText>
```

Available variants include `display`, `h1`, `h2`, `h3`, `body`, `bodySmall`, `label`, `caption` and `button`.

## Minimal screen example

```tsx
import { useWindowDimensions, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppScreen,
  AppText,
  appSpacing,
  isCompactViewport,
} from '@/shared/ui';

export function ExampleScreen() {
  const { width } = useWindowDimensions();
  const compact = isCompactViewport(width);

  return (
    <AppScreen
      contentContainerStyle={{
        gap: compact ? appSpacing.xl : appSpacing['2xl'],
      }}
      withHeader={false}
    >
      <AppText variant="h1">Ví dụ</AppText>
      <AppCard>
        <View style={{ gap: appSpacing.md }}>
          <AppText tone="secondary" variant="body">
            Render authoritative repository state here.
          </AppText>
          <AppButton onPress={() => undefined}>Tiếp tục</AppButton>
        </View>
      </AppCard>
    </AppScreen>
  );
}
```

The example shows composition only. A visible control does not authorize a command: capability, permission and server state must still come from the owning domain contract.

## Rebuild an intentionally blank route

1. Read `DESIGN.md`, `docs/architecture/mobile-frontend.md` and the owning feature contracts.
2. Inspect the existing route URL, deep-link behavior, repository, commands, capabilities and tests. Preserve them unless the task explicitly changes those contracts.
3. Create or migrate the feature screen. For a new screen, start with:

   ```bash
   npm run design:new-screen -- <feature> <PascalCaseName>
   ```

4. Use `App*` primitives and a feature-owned recipe. Do not copy the layout of Home or Messages; reuse their hierarchy, density, state clarity and compact behavior.
5. Replace only the route adapter that currently renders `ResetRouteScreen`.
6. Move that adapter from `resetAdapters` to `preservedAdapters` in `src/app-shell/navigation/__tests__/route-reset-policy.test.ts`, including the authoritative feature import.
7. Add focused native tests for loading, error, empty, disabled, pressed and capability-gated states that the screen owns.
8. Verify compact widths below 390 dp and regular widths. Interactive targets remain at least 44 dp.
9. Run the validation commands below before review.

Do not delete a route URL merely to remove its old frontend. Stable URLs and deep links are separate contracts.

## Change an existing authority surface

For Home or Messages changes:

- keep repository/domain state authoritative;
- keep keyboard ownership in `ChatComposerDock` for conversation UI;
- keep message transport, retry, queueing, receipts and capabilities in Messages-owned code;
- keep Home matching/session commands in their existing domain services;
- add reusable behavior to shared UI only when the abstraction is proven beyond one feature;
- update governance, documentation and focused tests together when changing the public UI API.

## Required validation

Run proportionate checks while developing and the complete handoff suite before merge:

```bash
npm run format:check
npm run repository:check
npm run assets:check
npm run lint
npm run typecheck
npm run architecture:check
npm run test:ci
```

For governance changes, also run directly:

```bash
npm run design-system:self-test
npm run design-system:check
```

## Review checklist

Before requesting review, confirm:

- imports use `@/shared/ui` rather than compatibility or deep paths;
- feature-only values remain in the owning feature recipe;
- no raw palette or removed liquid/glass/blur vocabulary was introduced;
- domain data, permissions and commands are not fabricated by presentation code;
- full-screen composition uses `AppScreen`, or an embedded/modal host has the required reason marker;
- compact and regular layouts preserve readability and 44 dp targets;
- route-reset policy was updated only when a real authoritative screen replaced the blank host;
- tests and validation evidence cover the behavior changed by the patch.
