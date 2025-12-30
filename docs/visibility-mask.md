# Visibility mask system

The visibility mask system standardizes how tile visibility is derived and consumed by overworld and combat overlays. It lets rendering code reason about exploration, frontier discovery, and combat territory without coupling masks to specific visual effects. Overworld overlays (like the tile shading in `drawTileVisibilityMask()`) and combat overlays both use the same visibility states so that visuals remain consistent while still honoring state-specific rules.

## Core APIs

### `resolveVisibilityMask(options, context)`
Located in `scripts/visibilityMask.js`.

**Purpose**
- Resolve an optional tile mask without altering the base map visuals.
- Supports precomputed masks or a lazy provider callback to defer computation.

**Inputs**
- `options.tileMask`: `Set<string> | Array<string> | Map<string, *>` of tile keys.
- `options.tileMaskProvider`: `({ layout, state, overworld, combat, frontierOnly, maskType }) => mask` callback.
- `options.frontierOnly`: boolean flag that toggles the mask type (`frontier` vs `unexplored`).
- `options.onMaskResolved`: optional hook invoked with the resolved payload.
- `context`: passthrough context (layout, state, overworld, combat, etc.).

**Output**
- `null` when no mask is available.
- Otherwise an object shaped like:
  ```js
  {
    mask, // Set/Array/Map of tile keys
    maskType: 'frontier' | 'unexplored',
    frontierOnly: boolean,
    context: Object
  }
  ```

**Typical usage**
- Overworld renderers can pass in the current layout/state to obtain a frontier or unexplored mask without duplicating lookup logic.

### `buildTileVisibilityMap({ overworld, claimable, combat, state })`
Located in `scripts/visibilityMask.js`.

**Purpose**
- Normalize overworld and combat signals into a single visibility map keyed by tile id.
- Enforces that combat overlays do not inherit overworld visibility data.

**Inputs**
- `overworld`: `Map<string, *>` of explored overworld tiles.
- `claimable`: `Map<string, *>` of frontier/claimable tiles.
- `combat`: `Map<string, *>` of combat territory tiles.
- `state`: `'OVERWORLD' | 'COMBAT'` (defaults to `'OVERWORLD'`).

**Output**
- `Map<string, 'unseen' | 'seen' | 'visible'>` describing tile visibility.

**Typical usage**
- `scripts/game/core.js#getTileVisibilityMap()` calls this each frame to cache a visibility map for overlays.
- In overworld: owned tiles are `visible`, frontier tiles become `seen`.
- In combat: player tiles are `visible`, enemy/neutral tiles become `seen`.

### `buildVisibilityMask(visibilityMap, states)`
Located in `scripts/visibilityMask.js`.

**Purpose**
- Convert a visibility map into a simple list of tile keys matching requested states.

**Inputs**
- `visibilityMap`: `Map<string, string>` produced by `buildTileVisibilityMap()`.
- `states`: array of states to include (defaults to `[TILE_VISIBILITY.UNSEEN]`).

**Output**
- `Array<string>` of tile keys that match the requested states.

**Typical usage**
- Overlays that target only unseen or frontier tiles (for example, a fog layer) can call this to get the relevant keys without re-deriving visibility.

## Integration with overlays

- Overworld rendering wires the visibility map into `drawOverworldTiles()`; its `drawTileOverlay` hook forwards the per-tile visibility state into `drawTileVisibilityMask()`.
- `drawTileVisibilityMask()` uses the visibility state to shade tiles: `unseen` tiles are fully masked, `seen` tiles receive a dimmed gradient, and `visible` tiles are left untouched.
- Combat overlays use the same normalized map, but `buildTileVisibilityMap()` intentionally ignores overworld data while in combat so frontier outlines are not reused.

## Usage patterns

```js
import {
  buildTileVisibilityMap,
  buildVisibilityMask,
  resolveVisibilityMask
} from '../visibilityMask.js';

const visibilityMap = buildTileVisibilityMap({
  state: game.state,
  overworld: game.overworld?.hexes,
  claimable: game.overworld?.claimable,
  combat: game.combat?.territory
});

const unseenKeys = buildVisibilityMask(visibilityMap); // defaults to unseen
const maskPayload = resolveVisibilityMask({
  tileMask: unseenKeys,
  frontierOnly: false
}, {
  layout: game.snow?.hexLayout,
  state: game.state,
  overworld: game.overworld,
  combat: game.combat
});
```
