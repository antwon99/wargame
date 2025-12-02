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

## Intro Overlay Behavior
- Markup lives in `Wargame.html` with IDs `intro-overlay` and `btn-intro-begin`.
- Styles in `style.css` use a dark radial background, centered text, and a simple uppercase Begin button. The `.intro-hidden` class drives the fade-out and disables pointer events.
- Logic in `scripts/introOverlay.js` wires the Begin button to add the hidden class and removes the overlay from pointer flow after the transition. The module exports `IntroOverlay` for tests and attaches itself on `DOMContentLoaded` in browsers.

## Notes for Future Iterations
- The fog center currently tracks the average screen position of explored/occupied tiles. If new world states emerge (e.g., multiple clusters), consider weighting the center toward the player’s focus hex.
- The overlay intentionally avoids game-state mutation so future tutorials or cinematics can hook into dismissal without changing current flow.
