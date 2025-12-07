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
- `renderFogBackdrop` accepts optional tile-mask hooks (precomputed masks or providers). When a mask is supplied, the base
  gradient relaxes its center opacity for explored space and blends a stronger, localized fog only on masked frontier/
  unexplored tiles. Without a mask, the renderer preserves the legacy full-screen blend (just with the brighter defaults below).

## Tuning
- `FOG_VISUAL_CONFIG` in `scripts/fogVisualConfig.mjs` centralizes presentation knobs:
  - **Base colors:** `voidFill` for the canvas clear, `fogGradientStops` (inner/mid/outer) for the main fill, and `spotlightColors` for cluster glows.
  - **Ripple control:** `rippleEnabled` toggles the secondary wave, while `rippleOpacity` fades its impact (the RGB stops live under `rippleGradientStops`).
  - **Parallax drift:** `parallaxSpeed` and `parallaxAmplitude` control the sinusoidal offset used for the fog’s center drift.
  - **Brightness defaults:** inner gradient and spotlight stops are lighter by default (`coreInnerOpacity`, brighter `innerBase`/mid stops, and a modest `clusterCoreBoost`) to keep starting clusters readable while keeping `voidFill` unchanged.
- `renderFogBackdrop(layout, options)` now uses tile masks to concentrate opacity only where needed: pass `tileMask`, a `tileMaskProvider({ layout, state, overworld, combat, frontierOnly, maskType })`, optional `frontierOnly` flags, and `onMaskResolved(payload)` callbacks for diagnostics. The base gradient softens when a mask exists, but when the mask is omitted the legacy uniform blend renders unchanged (aside from the brighter defaults).
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
