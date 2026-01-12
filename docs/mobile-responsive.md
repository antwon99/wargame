# Mobile Responsive HUD Sizing

## Why UI scaling was removed
The HUD previously relied on a global `#ui-root` scale transform to force density changes. That approach distorted layout math, created blurry text, and made hit targets unpredictable on different screens. The wrapper now renders at native CSS size, and scaling is handled at the component level with explicit sizing rules.

## What replaces the scale wrapper
HUD elements now share size tokens in `style.css` (see `:root`), including:

- `--touch-min` for a 44px minimum tap target.
- `--hud-padding-*`, `--hud-gap`, and `--hud-button-padding-*` for consistent spacing.
- `--hud-font-*` clamp values so typography scales smoothly between small and large viewports.

Key HUD components (`.top-bar`, `.resource-pill`, `.pause-toggle`, `.mandates-button`, `.btn`) reference those tokens directly, using `clamp()`/`min()`/`max()` sizes instead of global transforms.

## Touch target rule
All tap targets on mobile must meet a 44px minimum hit area. The mobile breakpoint explicitly defines `--touch-min: 44px`, and interactive controls (including `.hamburger`, `.pause-toggle`, `.mandates-button`, `.btn`, `.meta-btn`, and bottom action buttons) use `min-height`/`min-width` plus aligned padding so icon-only buttons stay comfortably tappable.

## Regression policy: desktop unchanged
Mobile-specific adjustments must be scoped exclusively to `@media (max-width: 768px)` blocks. Desktop selectors and layout rules outside that breakpoint should remain identical to pre-change behavior, with no new flex/grid tweaks or resized controls on larger viewports.
