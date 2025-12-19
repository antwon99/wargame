# Game Loop Module Split

The render/update pipeline now lives in dedicated helpers so overworld and combat behavior stay isolated:

- `scripts/game/overworld.js` bootstraps new campaigns, applies save snapshots, manages land-reclamation queues, and renders overworld tiles/visibility overlays.
- `scripts/game/combat.js` runs combat updates and manages draw/fx lifecycles for territory, units, and transient particles.
- `scripts/game/bootstrap.js` hosts `startGameLoop`, which routes per-frame updates between overworld and combat states before drawing and updating the audio debug panel.

These modules keep `core.js` focused on wiring dependencies and exposing a consistent API to the UI. Reclamation helpers remain reusable for tests or future UIs by taking an injected `game` reference rather than relying on globals.
