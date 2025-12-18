# Settings Service

The settings service isolates player-facing audio/visual preferences from the game loop so they can be unit-tested and reused without DOM or canvas dependencies.

## Responsibilities
- Build default audio + visual bundles that mirror the snow/audio baselines.
- Load and save settings snapshots through an injected storage adapter (localStorage by default, memory stubs in tests).
- Normalize incoming payloads (clamping audio to 0–1 and coercing visual toggles) before persisting.
- Emit `change`, `audio`, and `visual` events so UI and runtime systems can react without direct coupling.

## Runtime integration
- `scripts/game/core.js` instantiates the service during `Game.init`, wiring audio/visual adapters that push values into GameAudio and snow feature toggles.
- UI bindings subscribe implicitly through the Game instance so slider/checkbox changes call `applyAudio` / `applyVisual` instead of directly mutating state.

## Testing notes
- Use the in-memory storage stub pattern from `tests/settingsService.test.js` to run settings tests without a browser environment.
- When testing event emissions, attach listeners before invoking `load`, `applyAudio`, or `applyVisual`; each emits a `change` event after normalization.
