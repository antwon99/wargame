# Fog Overlay (PNG)

## Purpose
A dedicated fog layer now sits between the canvas and the UI to keep unexplored space visually distinct without touching tile rendering or game logic. The layer uses PNG textures stored in `/assets/fog/` so art can be swapped without code changes.

## Layering & Interaction
- Markup: `<div id="fog-overlay" class="fog-overlay">` inside `#game-container`, immediately above the canvas.
- CSS: `position:absolute; inset:0; z-index:4; pointer-events:none; background-size:cover;`.
- Ordering: Above the background/canvas, below HUD elements, the intro overlay, and debugging UI. Pointer events are disabled so map clicks and hovers continue to flow to the canvas.

## Variants
Two PNGs are bundled today:
- `assets/fog/fogdark.png` (default for unexplored space)
- `assets/fog/foglight.png` (intended for tiles bordering explored territory)

The overlay ships with `fogdark.png` applied on page load via CSS and a JS initializer. Variants can be swapped at runtime with a simple helper:

```js
setFogVariant('dark');  // applies assets/fog/fogdark.png
setFogVariant('light'); // applies assets/fog/foglight.png
```

The helper stores the requested variant even if the overlay has not initialized yet, so future calls to `FogOverlay.init()` will honor the latest choice.

## Touchpoints
- Markup: `Wargame.html`
- Styles: `style.css` (`.fog-overlay` ruleset)
- Behavior: `scripts/fogOverlay.js` (initialization + variant swapping)

No gameplay systems read from or write to the overlay; it is purely visual. Future territory-aware fog logic should call `setFogVariant` rather than mutating tile data.
