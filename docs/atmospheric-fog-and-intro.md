# Atmospheric Fog + Intro Overlay

## Overview
Two visual-only layers bolster early session identity without changing any game rules:

1. **Fog Backdrop (canvas rendering)** – unexplored space now renders as a soft radial fog that fades darker the farther it is from explored territory. The gradient drifts subtly over time so the map background feels alive without affecting interaction or tile logic.
2. **Intro Overlay (UI block)** – a fullscreen overlay with a brief narrative setup and a Begin button that must be dismissed before interacting with the board. It fades away but does not reset or reload the game state.

## Fog Rendering Details
- Implemented in `scripts/script.js` via `renderFogBackdrop` and `getTerritoryScreenCenter`.
- The backdrop is drawn before any tiles using two radial gradients:
  - A primary gradient lightens around the centroid of explored/occupied tiles and darkens toward the edges.
  - A low-opacity ripple gradient drifts using a sine timer (`fog.time`) to keep the fog from feeling static.
- No gameplay data is mutated; the functions only read existing territory maps to position the visuals.
- `renderFogBackdrop` now accepts optional tile-mask hooks (precomputed masks or providers) but ignores them for now. This keeps
  the visual output identical while offering a future entry point for tile-precise fog.

## Tuning
- `FOG_VISUAL_CONFIG` in `scripts/fogVisualConfig.mjs` centralizes presentation knobs:
  - **Base colors:** `voidFill` for the canvas clear, `fogGradientStops` (inner/mid/outer) for the main fill, and `spotlightColors` for cluster glows.
  - **Ripple control:** `rippleEnabled` toggles the secondary wave, while `rippleOpacity` fades its impact (the RGB stops live under `rippleGradientStops`).
  - **Parallax drift:** `parallaxSpeed` and `parallaxAmplitude` control the sinusoidal offset used for the fog’s center drift.
- `renderFogBackdrop(layout, options)` accepts tile-mask hooks for future tile-precise fog layering without altering current visuals: pass `tileMask`, a `tileMaskProvider({ layout, state, overworld, combat, frontierOnly, maskType })`, optional `frontierOnly` flags, and `onMaskResolved(payload)` callbacks for diagnostics.
- The debug helper `attachFogParallaxDebugControls` exposes a `FogParallaxTuning` API on `window` (setters for speed/amplitude plus a getter), enabling live tweaks without code reloads.
- Default layering order stays intact when overriding: the void fill draws first, then the main fog gradient, ripple (if enabled), and cluster spotlights; tiles and UI render afterward, and `drawTileFog` remains a no-op extension point.
- Example overrides:
  - Feature toggle override: `game.featureToggles.fog = { ...FOG_VISUAL_CONFIG, voidFill: '#05050a', rippleEnabled: false, parallaxSpeed: 0.5 };`
  - Tile-mask hook: `renderFogBackdrop(layout, { frontierOnly: true, tileMask: new Set(frontierKeys), onMaskResolved: ({ maskType }) => console.debug('Fog mask', maskType) });`
  - Console tuning: `FogParallaxTuning.setAmplitude(40); FogParallaxTuning.setSpeed(0.6);`

## Intro Overlay Behavior
- Markup lives in `Wargame.html` with IDs `intro-overlay` and `btn-intro-begin`.
- Styles in `style.css` use a dark radial background, centered text, and a simple uppercase Begin button. The `.intro-hidden` class drives the fade-out and disables pointer events.
- Logic in `scripts/introOverlay.js` wires the Begin button to add the hidden class and removes the overlay from pointer flow after the transition. The module exports `IntroOverlay` for tests and attaches itself on `DOMContentLoaded` in browsers.

## Notes for Future Iterations
- The fog center currently tracks the average screen position of explored/occupied tiles. If new world states emerge (e.g., multiple clusters), consider weighting the center toward the player’s focus hex.
- The overlay intentionally avoids game-state mutation so future tutorials or cinematics can hook into dismissal without changing current flow.
