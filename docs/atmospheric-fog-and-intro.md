# Atmospheric Fog + Intro Overlay

## Overview
Two visual-only layers exist, but the atmospheric flourishes are **opt-in** and ship disabled so the baseline is a quiet void fill:

1. **Fog Backdrop (canvas rendering)** – legacy radial gradients/ripples are off by default. The canvas clears to the void color and stays static unless debug toggles are flipped for QA.
2. **Intro Overlay (UI block)** – a fullscreen overlay with a brief narrative setup and a Begin button that must be dismissed before interacting with the board. It fades away but does not reset or reload the game state. Copy should mirror the in-game overlay: concise prompt plus a Begin/Start label.

## Fog Rendering Details
- Implemented in `scripts/script.js` via `renderFogBackdrop` and `getTerritoryScreenCenter`.
- Default behavior clears to `voidFill` only; gradients, ripples, and cluster glows remain off unless explicitly enabled for
  debugging or future seasonal reuse (e.g., snow drift experiments).
- No gameplay data is mutated; the functions only read existing territory maps to position visuals when requested.
- `renderFogBackdrop` still accepts tile-mask hooks (precomputed masks or providers). When a mask is supplied and visuals are
  toggled on, the base gradient relaxes its center opacity for explored space and blends localized fog on masked frontier/
  unexplored tiles. With visuals off, the mask path becomes a noop while keeping mask utilities available for other systems.

## Tuning
- `FOG_VISUAL_CONFIG` in `scripts/fogVisualConfig.mjs` still centralizes presentation knobs for anyone re-enabling visuals:
  - **Base colors:** `voidFill` for the canvas clear, `fogGradientStops` (inner/mid/outer) for the main fill, and `spotlightColors` for cluster glows.
  - **Ripple control:** `rippleEnabled` toggles the secondary wave, while `rippleOpacity` fades its impact (the RGB stops live under `rippleGradientStops`). Defaults leave these off.
  - **Parallax drift:** `parallaxSpeed` and `parallaxAmplitude` control the sinusoidal offset used for the fog’s center drift when enabled; keep them at zero for a static void.
  - **Brightness defaults:** inner gradient and spotlight stops remain documented for teams that intentionally bring the backdrop back for tests.
- `renderFogBackdrop(layout, options)` keeps mask hooks: pass `tileMask`, a `tileMaskProvider({ layout, state, overworld, combat, frontierOnly, maskType })`, optional `frontierOnly` flags, and `onMaskResolved(payload)` callbacks for diagnostics. With visuals disabled, the mask path is inert but still useful for QA telemetry.
- Layering order stays intact when re-enabled: the void fill draws first, then the main fog gradient, ripple (if enabled), and cluster spotlights; tiles and UI render afterward, and `drawTileFog` remains a no-op extension point.
- Example overrides:
  - Feature toggle override: `game.featureToggles.fog = { ...FOG_VISUAL_CONFIG, legacyBackdropEnabled: true, rippleEnabled: true, parallaxSpeed: 0.5 };`
  - Tile-mask hook: `renderFogBackdrop(layout, { frontierOnly: true, tileMask: new Set(frontierKeys), onMaskResolved: ({ maskType }) => console.debug('Fog mask', maskType) });`
  - Runtime toggles: use the debug overlay (F3) to flip backdrop fog, tile fog, ambience clouds, or fog flourishes without touching console globals; ship defaults keep everything dark.

## Intro Overlay Behavior
- Markup lives in `Wargame.html` with IDs `intro-overlay` and `btn-intro-begin`.
- Styles in `style.css` use a dark radial background, centered text, and a simple uppercase Begin button. The `.intro-hidden` class drives the fade-out and disables pointer events.
- Logic in `scripts/introOverlay.js` wires the Begin button to add the hidden class and removes the overlay from pointer flow after the transition. The module exports `IntroOverlay` for tests and attaches itself on `DOMContentLoaded` in browsers.

## Notes for Future Iterations
- The fog center currently tracks the average screen position of explored/occupied tiles. If new world states emerge (e.g., multiple clusters), consider weighting the center toward the player’s focus hex.
- The overlay intentionally avoids game-state mutation so future tutorials or cinematics can hook into dismissal without changing current flow.
