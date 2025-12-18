# Seasonal snow overlay

The fog-of-war visuals have been retired in favor of a seasonal snow treatment. A rising white gradient is painted beneath the map during winter months to communicate harsh weather without hiding terrain.

## Calendar rules
- Snow appears October through March (`SNOW_MONTHS` in `scripts/snowVisualConfig.mjs`).
- Coverage ramps up toward the winter midpoint and eases back down as spring arrives.
- Opting out of snow (`snowEnabled` or `snowfallEnabled` set to false) forces zero coverage even in winter.

## Rendering details
- `renderSnowOverlay()` in `scripts/game/core.js` clears the canvas to the void color, then draws a bottom-up white gradient sized by the resolved `coverage` value from `resolveSnowVisualConfig()`.
- Coverage is clamped between `minCoverage` and `maxCoverage` so the overlay never overwhelms the scene.
- Tile visibility shading now runs through `drawTileVisibilityMask()`; it remains separate from snow so exploration clarity is preserved.

## Settings and debug controls
- Sidebar settings expose **Snow Overlay** and **Seasonal Snowfall** toggles, mapped to `featureToggles.snow`.
- The audio/debug overlay (F3) mirrors the same toggles for quick QA flips.

## Extending
- Adjust seasonal coverage or opacity in `scripts/snowVisualConfig.mjs`.
- Hook custom tile overlays via `drawTileOverlay` in `scripts/overworldRenderer.js` if additional per-tile effects are needed.
