# Canonical LiQi visual primitives

Import from the package root only:

```ts
import {
  LiqiCard,
  LiqiSectionHeader,
  LiqiSurface,
} from '@/shared/components/liqi';
```

Do not deep-import individual files. These primitives implement the Home-derived visual contract documented in [`DESIGN.md`](../../../../DESIGN.md).

Choose the narrowest primitive that owns the behavior:

- `LiqiSurface`: base opaque surface and emphasis model;
- `LiqiCard`: content density and card geometry;
- `LiqiButton`, `LiqiOrbButton`: interactive hierarchy and target sizing;
- `LiqiChip`, `LiqiBadge`: compact semantic state;
- `LiqiSectionHeader`, `LiqiIdentityHeader`: shared hierarchy;
- `LiqiBackground`, `LiqiBottomNav`: application atmosphere and presentation-only navigation.

Feature composition stays in the feature. Add a shared primitive only when the decision is reusable across product surfaces.
