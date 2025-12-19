# Game State Factories

The `scripts/game/state.js` module centralizes pure constructors for Game state so tests and tooling can create clean snapshots without hitting the DOM, audio stack, or persistence.

## Factory Surface
- `createHexFactory(sqrt3?)` / `createHexLayout(sqrt3?)`: Hex math helpers that mirror `InputHelpers` without requiring the browser runtime.
- `buildCoreResourceState(options?)`: Seeds gold, wood, upgrades, research bonuses, and stats using the provided fallback stats template.
- `buildOverworldState()` / `buildCombatState()`: Return fresh containers for map structures so suites do not share `Map` instances.
- `buildCameraState()` / `buildSnowState()` / `buildFeatureToggles(options?)`: Isolated rendering + overlay defaults for deterministic visual tests.
- `buildTimekeeperConfig(startTick?)`: Supplies a safe config for `Timekeeper` without instantiating it.

## Usage
Import factories from `scripts/game/core.js` or directly from `scripts/game/state.js` when constructing headless cores:

```js
import { createGameCore, buildFeatureToggles } from '../scripts/game/core.js';

const { Game } = createGameCore();
Game.timekeeper.reset(buildTimekeeperConfig().startTick);

const toggles = buildFeatureToggles({ snowDefaults: { enabled: false, maxOpacity: 0 } });
```

These helpers avoid DOM lookups; defer to `Game.init()` when real canvas bindings and audio wiring are required.
