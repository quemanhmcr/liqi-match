# Features

Each directory is an independently owned product domain. Route files stay in
`src/app`; feature UI, data, model and service logic stay here.

Use this shape when a part has real behavior:

```text
<feature>/
  index.ts        # optional, lightweight cross-layer API (not a screen barrel)
  screens/        # route-level UI owned by the feature
  components/     # feature-local UI
  model/          # state and pure domain logic
  services/       # feature orchestration/API mapping
  data/           # feature-local fixtures/static content
  __tests__/
```

Route adapters may import one module from this feature's `screens/` boundary;
they must never reach components, model, services or data. Do not import another
feature. Extract a concept to `src/entities` only after two features need it;
extract to `src/shared` only when it is genuinely feature-agnostic. Full rules live in
[`docs/architecture/mobile-frontend.md`](../../docs/architecture/mobile-frontend.md).
