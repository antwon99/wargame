# Overworld fog states and ambience layers

Per-tile fog overlays and the drifting ambience clouds are driven by separate pipelines so visual toggles never change the map's
logic. Use the hooks below when composing new renderers or debugging visibility.

## Tile visibility states
- **unseen**: No claim or discovery yet. Tiles render with an opaque shroud to hide art and overlays.
- **seen**: Frontier/claimable tiles or enemy/neutral combat cells. Art is visible but dimmed/desaturated.
- **visible**: Owned tiles. No fog mask is applied.

`buildTileVisibilityMap()` in `scripts/fogMask.js` merges overworld, claimable, and combat maps into a normalized `Map` keyed by
hex string. `drawOverworldTiles()` forwards the resolved state into `drawTileFog` along with a `fogState` flags object so custom
fog hooks can branch without recomputing booleans:
- `visibility`: normalized label above.
- `isUnseen` / `isSeen` / `isVisible`: convenience booleans for shader/brush selection.
- `ambienceEnabled` / `ambienceLayersEnabled`: whether ambience clouds are currently active; disabling them does not change tile
  visibility.

## Ambience cloud layers
The ambience renderer (see `scripts/ambienceRenderer.js`) layers grayscale cloud sheets between the backdrop fill and tile pass.
Each layer drifts independently to avoid tiling artifacts and respects the active viewport size. Seasonal snowfall now modulates
these layers: winter months raise density/opacity/whiteness and speed up the drift, while summer months mute ambience back to
the original dark void unless a small noise floor is enabled for debug.

Fog visuals pull their knobs from `scripts/fogVisualConfig.mjs` and `featureToggles.ambience`:
- `ambienceEnabled`: master switch for ambience rendering.
- `ambienceLayersEnabled`: gate specifically for the layered clouds while preserving the fog backdrop.
- `baseFillOnlyWhenAmbienceDisabled`: when true, ambience-off frames still clear the canvas with the void color before tiles and
  tile fog draw.
- `legacyBackdropEnabled`: keeps the gradient/ripple/cluster glows on; disable to rely solely on ambience clouds and the void
  fill. The seasonal snowfall defaults this to **off** to preserve the stark winter void while keeping the legacy stack
  available for debugging.

### Example toggle usage
```js
// Disable ambience clouds without affecting per-tile fog resolution
const fogConfig = resolveFogVisualConfig({ ambienceLayersEnabled: false });
game.featureToggles.ambience = { enabled: false };

drawOverworldTiles(game.overworld, {
    layout,
    parseKey,
    drawHex,
    drawTileFog: (hex, tile, visibility, fogState) => {
        if (!fogState.ambienceEnabled) return; // skip ambience-linked accents only
        paintOutline(hex, visibility);
    },
    tileVisibility: game.getTileVisibilityMap(),
    ambienceEnabled: fogConfig.ambienceEnabled,
    ambienceLayersEnabled: fogConfig.ambienceLayersEnabled
});
```
Visibility stays consistent regardless of ambience toggles; only the layered cloud rendering path is affected.
