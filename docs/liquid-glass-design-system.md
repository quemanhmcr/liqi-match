# LIQI Liquid Glass Design System

## Philosophy

LIQI dùng triết lý:

> Dark glass surface + subtle atmospheric background + path-based specular edge glow + soft depth shadow + restrained accent color + airy typography.

Liquid Glass trong app này không phải là “nhiều hiệu ứng”. Nó là một hệ vật liệu thống nhất: cùng nền tối, cùng độ trong, cùng ánh sáng cạnh, cùng depth, cùng typography và cùng cách dùng accent.

Định hướng cuối cùng:

> Ít hơn một chút, mềm hơn một chút, trong hơn một chút.

Màn `/home` là reference implementation. Các màn Khám phá, Tin nhắn, Profile phải kế thừa từ hệ này thay vì tự phát minh material riêng.

## Rules

Không dùng neon glow mạnh.
Không dùng View tròn/oval để giả glow cho component.
Không dùng border sáng đều toàn card.
Không để component tự chọn màu tùy ý.
Không dùng button solid quá đặc.
Không để background glow lộ shape ellipse rõ.
Không để bottom nav / CTA phụ cạnh tranh với hero CTA.
Không thêm effect mới nếu effect cũ chưa được hệ thống hóa.
Mọi page phải dùng token/component preset chung.

## Material roles

- `BlurView` = backdrop glass surface.
- `Skia Path + BlurMask` = edge light / bloom.
- `LinearGradient` = material tint / sheen.

Không trộn vai trò. Đặc biệt, không dùng `BlurView` để tạo edge glow và không dùng blob view để giả specular edge.

## Tokens

Source of truth nằm ở:

```ts
src / shared / theme / liquid - glass.tokens.ts;
```

Các nhóm token chính:

- `liquidColors`: background, text, accent, stroke.
- `liquidGlass`: surface background, blur intensity, radius.
- `liquidEdgeGlow`: pad, base stroke, hairline, bloom, CTA defaults.
- `liquidShadow`: card, CTA, nav depth.
- `liquidTypography`: screen, hero, section, card, body, chip, CTA text.

Full base stroke phải rất nhẹ. Ánh sáng chính nằm ở segment glow, không nằm ở border toàn card.

## Edge glow presets

Preset nằm ở:

```ts
src / shared / theme / liquid - glow.presets.ts;
```

Các preset hiện có:

- `heroGlowSegments`: top-left purple rất ngắn; right/bottom-right cyan nhẹ.
- `matchedPurpleGlowSegments`: card purple mặc định, asymmetric.
- `rankCyanGlowSegments`: cyan edge restrained cho rank/card cyan.
- `teamOrangeGlowSegments`: orange lower-right rất nhẹ.
- `ctaPurpleCyanGlowSegments`: capsule CTA glow.
- `navActiveGlowSegments`: nav glow tối thiểu, không dominant.

Segment glow phải ngắn, asymmetric, không sáng đều toàn cạnh. Bloom có thể dài hơn hairline một chút để endpoint tan mềm, tránh cảm giác dash-line bị cắt.

Không page nào tự viết segment mới nếu chưa cần. Nếu cần preset mới, thêm vào file này và review trên Android screenshot thật.

## Shared components

Namespace chuẩn:

```ts
src/shared/components/liquid/
```

### LiquidBackground

Dùng cho mọi page. Default gồm dark base, atmospheric purple/cyan rất lớn, opacity thấp và bottom fade. Background chỉ tạo ambience; không phải nơi nhét component glow.

### LiquidScreen

Scaffold cho mọi page:

```tsx
<LiquidScreen title="Khám phá">...</LiquidScreen>
```

Default:

- dùng `LiquidBackground`;
- safe area aware;
- horizontal padding giống `/home`;
- padding bottom đủ cho bottom nav qua `liquidLayout.bottomNavSpacer`;
- title/subtitle dùng typography token;
- page không tự set background riêng nếu không cần.

### LiquidGlassSurface

Component nền chuẩn cho card/panel.

```ts
type LiquidGlassSurfaceProps = {
  variant?: 'hero' | 'card' | 'nav' | 'modal' | 'button';
  glowPreset?: LiquidGlowPreset;
  radius?: number;
  width?: number;
  height?: number;
  withGlow?: boolean;
  withShadow?: boolean;
  withInnerReflection?: boolean;
  children: React.ReactNode;
};
```

Default behavior:

- outer `overflow: visible`;
- inner surface `overflow: hidden`;
- `BlurView` chỉ lo glass surface;
- Skia glow lo edge light;
- không dùng View blob glow.

### LiquidEdgeGlow

Component path glow chuẩn. Yêu cầu:

- hỗ trợ `width`/`height` fixed;
- fallback `onLayout` khi chưa có size;
- có `pad`, path nằm trong padding;
- memo hóa path và segment arrays;
- không render khi chưa có size;
- fallback null nếu Skia node không available trong môi trường test/runtime.

### LiquidButton

CTA toàn app.

Variants:

```ts
variant?: 'primary' | 'secondary' | 'rank' | 'team' | 'ghost';
state?: 'idle' | 'active' | 'disabled';
```

Default:

- body gradient dịu;
- inner top sheen;
- edge glow theo preset;
- text weight 700;
- không solid neon;
- không Android ripple vuông.

### LiquidChip

Dùng cho mode chip, tag chip, filter chip.

Variants:

```ts
variant?: 'default' | 'selected' | 'purple' | 'cyan' | 'orange';
density?: 'mode' | 'compact' | 'tag';
withSheen?: boolean;
```

Default:

- inactive = dark glass;
- selected = glass tint nhẹ, không fill đặc;
- border/hairline nhẹ;
- no heavy shadow;
- metadata tag nhỏ phải dùng `density="tag"`, không dùng sheen, không dùng fill/border mạnh.

### LiquidCard

Dùng cho matched card, explore card, message thread card, profile stat card.

```ts
variant?: 'default' | 'purple' | 'cyan' | 'orange';
density?: 'compact' | 'regular' | 'large';
```

Default:

- surface tối;
- tint rất nhẹ;
- edge glow preset;
- shadow depth mềm;
- no full neon border.

### LiquidOrbButton

Dùng cho notification, quick action, floating action dạng orb. Vẫn dùng glass surface + path glow, không dùng solid circle neon.

### LiquidBottomNav

Bottom nav duy nhất cho toàn app. Không mỗi page render nav khác nhau. Active state phải chìm, không cạnh tranh với hero CTA.

## Android BlurView standard

Android dùng `BlurTargetView` ở screen root. `LiquidScreen` đã tạo blur target và truyền qua context cho `LiquidGlassSurface`.

Pattern chuẩn:

```tsx
<BlurTargetView ref={blurTargetRef} style={StyleSheet.absoluteFill}>
  <LiquidBackground />
</BlurTargetView>

<LiquidGlassSurface blurTarget={blurTargetRef}>
  ...
</LiquidGlassSurface>
```

Nếu không dùng `LiquidScreen`, page chịu trách nhiệm tạo `BlurTargetView`. Không dùng `BlurView` để tạo glow edge. Glow edge luôn dùng Skia path.

## Usage examples

### Card

```tsx
<LiquidCard variant="purple">
  <Text style={liquidTypography.cardTitle}>Minh Anh</Text>
</LiquidCard>
```

### CTA

```tsx
<LiquidButton variant="primary">Vào set</LiquidButton>
```

### Chip

```tsx
<LiquidChip selected icon={<Ionicons name="shield" size={12} />}>
  Normal
</LiquidChip>
```

### Screen

```tsx
<LiquidScreen title="Khám phá">
  <LiquidCard>
    <Text style={liquidTypography.cardTitle}>Đề xuất hôm nay</Text>
  </LiquidCard>
</LiquidScreen>
```

## Rules for next pages

### Explore page

Dùng `LiquidScreen`, `LiquidCard`, `LiquidChip`, `LiquidButton`, `LiquidBackground`. Không tự tạo card style riêng.

### Messages page

Dùng `LiquidCard` cho thread row, `LiquidOrbButton` cho action, badge dùng token badge chung. Không dùng bubble solid neon.

### Profile page

Dùng `LiquidGlassSurface` cho profile header, `LiquidCard` cho stats/settings, `LiquidButton` cho primary action. Avatar orb dùng token chung.

### Bottom nav

Dùng một component duy nhất: `LiquidBottomNav`. Không mỗi page render nav khác nhau.

## Visual regression checklist

Trước khi merge page mới:

- [ ] Page dùng `LiquidScreen`.
- [ ] Background không tự custom quá khác `/home`.
- [ ] Card dùng `LiquidGlassSurface` hoặc `LiquidCard`.
- [ ] CTA dùng `LiquidButton`.
- [ ] Chip dùng `LiquidChip`.
- [ ] Không có View blob glow cho component.
- [ ] Không có border neon sáng đều.
- [ ] Không có button solid quá gắt.
- [ ] Không có shadow thành cục tối.
- [ ] Không có bottom nav che content.
- [ ] Typography dùng token.
- [ ] Accent màu không vượt quá độ saturation của `/home`.
- [ ] Android screenshot nhìn không khác chất liệu `/home`.

## Acceptance for foundation pass

- Có tài liệu này.
- Có token file cho color/glass/glow/shadow/typography.
- Có preset file cho Skia edge glow.
- Có component shared liquid.
- `/home` dùng lại hệ thống mới, visual giữ gần baseline.
- Page mới có thể build bằng component/tokens mà không copy style từ `/home`.
- Typecheck pass.
- Lint pass.
- Test hiện tại pass.
- Không thêm hiệu ứng mới ngoài system.

## Guardrails against style drift

Page-level code không được hardcode liquid material riêng.

Rule review:

- Không hardcode `rgba(...)` cho glass/glow/shadow/border trong `src/app/*`, trừ playground/dev route hoặc one-off content illustration đã được review.
- Không hardcode `shadowColor`, `shadowOpacity`, `shadowRadius` trong page.
- Không tạo `LinearGradient` màu tự chế cho CTA/card/nav nếu token/component đã có variant tương ứng.
- Không khai báo Skia segment inline trong page. Segment mới phải đi qua `src/shared/theme/liquid-glow.presets.ts`.
- Nếu cần style mới, thêm token/preset/component trước, sau đó page chỉ compose lại.

Checklist review bổ sung:

- [ ] Không có `rgba(...)` hardcode mới trong page-level material.
- [ ] Không có `shadowColor`/`shadowOpacity` hardcode mới trong page.
- [ ] Không có `LinearGradient` màu tự chế ngoài token/preset/component.
- [ ] Không có Skia segment inline trong page.
- [ ] Import Liquid component từ `@/shared/components/liquid`.

## Variant contract

### LiquidCard

- `default`: card thường, neutral/purple glass nhẹ.
- `purple`: social, tri kỉ, matched, relationship-oriented content.
- `cyan`: rank, online, competitive, live/ready content.
- `orange`: team-rank, waiting, lobby/team availability.
- `density="list"`: thread/settings/list row hiệu năng nhẹ; mặc định giảm glass/glow xuống low.
- `density="compact"`: matched card hoặc card nhiều metadata.
- `density="regular"`: card content mặc định.
- `density="large"`: empty state, hero-like content block, modal body.

### LiquidButton

- `primary`: CTA chính của screen hoặc hero section. Mỗi section chỉ nên có một primary dominant.
- `secondary`: CTA phụ, không cạnh tranh với primary.
- `rank`: CTA rank/cyan hoặc competitive action.
- `team`: CTA team/orange hoặc waiting/lobby action.
- `ghost`: action nhẹ, filter/reset/tertiary action.

### LiquidChip

- `default`: inactive filter/tag.
- `selected`: selected state, tint nhẹ, không fill đặc.
- `purple`: social/matched/tri kỉ tag.
- `cyan`: rank/online/live tag.
- `orange`: team/waiting/lobby tag.
- `density="mode"`: mode/filter chip có sheen nhẹ.
- `density="tag"`: metadata chip nhỏ như hero/role tags; không sheen, border rất mờ, fill nhẹ, text giảm opacity.

### LiquidBadge

- `pink`: unread/notification count.
- `cyan`: live/rank count.
- `orange`: waiting/team count.
- `neutral`: passive count.

### LiquidSectionHeader

Dùng cho mọi section có label/title kiểu `MATCHED / Đã match thành công`. Không tự set title scale ở page mới.

## Reduced transparency and low performance fallback

Token runtime nằm ở `liquidRuntime`:

```ts
export const liquidRuntime = {
  reducedTransparency: false,
  lowPerformanceMode: false,
};
```

Component knobs:

```tsx
<LiquidScreen reducedGlass />
<LiquidGlassSurface glassIntensity="low" glowIntensity="low" />
<LiquidCard density="list" glowIntensity="none" reducedGlass />
```

Fallback phải giữ contrast tốt:

- giảm blur;
- giảm hoặc tắt glow;
- tăng opacity nền surface;
- giữ text token, không đổi sang màu neon.

## Intensity scale

Dùng intensity để giữ hierarchy thay vì tạo style riêng:

- Hero: `glassIntensity="high"`, `glowIntensity="high"` nếu cần nhấn mạnh.
- Matched card: default `medium`.
- Message row: `density="list"`, `glowIntensity="low"`.
- Settings row: `density="list"`, `glowIntensity="none"` hoặc `low`.
- Bottom nav: default nav material, không vượt hero CTA.
- Modal: `variant="modal"`, glass high nếu nội dung cần tách nền.

Không dùng `high` cho list dài.

## Performance budget

- Một screen không nên render quá nhiều Skia Canvas nặng cùng lúc.
- 3–10 `LiquidCard` static trong ScrollView ổn.
- List dài phải dùng `density="list"`, `glowIntensity="low"` hoặc `none`.
- Không animate blur intensity, stroke width, Skia blur liên tục.
- Chỉ animate opacity/scale/translate nếu cần.
- Segment arrays phải import preset hoặc memo hóa.
- Ưu tiên fixed `width`/`height` cho orb/button/card quan trọng.
- Không dùng glow high trong FlatList/large ScrollView.
- Android screenshot/perf cảm nhận là gate trước khi merge page mới có nhiều glass rows.
- Page có bottom nav phải dùng `LiquidScreen` spacer chung, không tự set `paddingBottom` riêng.

## Visual playground

Dev route:

```txt
src/app/dev/liquid-system.tsx
```

Mục đích: mở một màn duy nhất để soi `LiquidButton`, `LiquidChip`, `LiquidCard`, `LiquidBadge`, `LiquidOrbButton`, `LiquidBottomNav`, reduced-glass fallback và density list trước khi chỉnh token.

## Screenshot reference

`/home` là visual reference. Sau khi chạy Android thật, lưu screenshot tại:

```txt
docs/screenshots/home-liquid-reference.png
```

Không tự tạo ảnh giả. Mọi thay đổi token/preset/component phải so với screenshot này và kiểm tra Android thật trước khi claim visual ổn. Kiểm tra riêng case scroll tới card cuối: nội dung/CTA không được nằm dưới bottom nav.

## Deprecated import path

`src/shared/components/liquid-edge-glow.tsx` chỉ còn là compatibility re-export.

Deprecated:

```ts
import { LiquidEdgeGlow } from '@/shared/components/liquid-edge-glow';
```

Use:

```ts
import { LiquidEdgeGlow } from '@/shared/components/liquid';
```

Page mới không được import từ path cũ.

## Page recipes

### Explore

- Screen: `LiquidScreen`.
- Header/search: glass pill bằng `LiquidGlassSurface` hoặc `LiquidCard density="list" glowIntensity="low"`.
- Filters: `LiquidChip`.
- Discovery cards: `LiquidCard variant="default" | "cyan"`.
- Primary action: `LiquidButton variant="secondary"` hoặc `primary` chỉ khi là CTA chính của screen.
- Badges: `LiquidBadge`, không tự tạo pill neon.

### Messages

- Thread row: `LiquidCard density="list" glowIntensity="low"`.
- Unread count: `LiquidBadge variant="pink"`.
- Quick action: `LiquidOrbButton`.
- Composer: `LiquidGlassSurface variant="nav"` hoặc `card` tùy layout.
- Send button: `LiquidOrbButton`.
- Không dùng bubble solid neon.

### Profile

- Profile header: `LiquidGlassSurface variant="hero"`.
- Stats: `LiquidCard density="compact"`.
- Settings rows: `LiquidCard density="list" glowIntensity="none" | "low"`.
- Edit profile: `LiquidButton variant="secondary"`.
- Avatar orb dùng token/preset chung, không tự tạo glow oval.
