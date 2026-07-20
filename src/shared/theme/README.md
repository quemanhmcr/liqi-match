# Canonical LiQi theme API

Product code imports design values only from:

```ts
import {
  liqiColors,
  liqiComponents,
  liqiSpacing,
  liqiTypography,
} from '@/shared/theme/liqi-design-system';
```

`liqi-foundation.tokens.ts` owns semantic foundations. `liqi-component.tokens.ts` owns reusable recipes and named product invariants. `liqi-design-system.ts` is the only public import surface.

Do not import token implementation files directly and do not add a feature-local palette. A new semantic decision belongs in the canonical system only when it is reusable or a named product invariant; update `DESIGN.md`, the full design specification, checker and focused tests in the same change.
