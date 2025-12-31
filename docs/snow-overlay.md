# Seasonal snow overlay

The fog-of-war visuals have been retired in favor of a seasonal snow treatment. A uniform white wash is painted beneath the map during winter months to communicate harsh weather without hiding terrain.

## Calendar rules
- Snow appears October through March (`SNOW_MONTHS` in `scripts/snowVisualConfig.js`) using the in-game calendar (campaigns start in April).
- Coverage ramps up toward the winter midpoint and eases back down as spring arrives.
- Opting out of snow (`snowEnabled` or `snowfallEnabled` set to false) forces zero coverage even in winter.

## Rendering details
- `renderSnowOverlay()` in `scripts/game/core.js` clears the canvas to the void color, then washes the viewport with a solid white overlay sized by the resolved `coverage` value from `resolveSnowVisualConfig()`.
- Coverage is clamped between `minCoverage` and `maxCoverage` so the overlay never overwhelms the scene, and opacity rises/falls smoothly throughout the winter months.
- Tile visibility shading now runs through `drawTileVisibilityMask()`; it remains separate from snow so exploration clarity is preserved. See [Visibility mask system](visibility-mask.md) for API context.

## Settings and debug controls
- Sidebar settings expose **Snow Overlay** and **Seasonal Snowfall** toggles, mapped to `featureToggles.snow`.
- The audio/debug overlay (F3) mirrors the same toggles for quick QA flips.

## Extending
- Adjust seasonal coverage or opacity weighting in `scripts/snowVisualConfig.js`; values fade in at October and taper back down by March.
- Hook custom tile overlays via `drawTileOverlay` in `scripts/overworldRenderer.js` if additional per-tile effects are needed.
