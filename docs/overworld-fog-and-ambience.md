# Overworld fog states and ambience layers

Per-tile fog overlays and the ambience utilities are still split, but the legacy gradients/ripples/backdrop flourishes now ship
**disabled by default**. The visual baseline is a static void fill; enabling accents is opt-in so players no longer expect
permanent motion. Use the hooks below when composing new renderers or debugging visibility.

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
The ambience renderer (see `scripts/ambienceRenderer.js`) still ships as a grayscale cloud utility, but the live drift is **off
by default** to match the void baseline. Each layer can still tile-safe parallax once enabled.

Fog visuals pull their knobs from `scripts/fogVisualConfig.mjs` and `featureToggles.ambience`:
- `ambienceEnabled`: master switch for ambience rendering.
- `ambienceLayersEnabled`: gate specifically for the layered clouds while preserving the fog backdrop (void-only when false).
- `baseFillOnlyWhenAmbienceDisabled`: when true, ambience-off frames still clear the canvas with the void color before tiles and
  tile fog draw.
- `legacyBackdropEnabled`: keeps the gradient/ripple/cluster glows on; ships false so overlays stay quiet until toggled.

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

## Reusable fog utilities
- `scripts/ambienceRenderer.js`: exposes a standalone cloud-layer generator. It now defaults to `enabled: false` so tests,
  atmospheric experiments, or planned snow reuse can construct it without painting until a toggle flips it on. Enable through
  `featureToggles.fog.ambienceLayersEnabled` **and** `featureToggles.ambience.enabled`, or via the debug overlay (F3) when
  troubleshooting visuals.
- `scripts/fogVisualConfig.mjs`: provides `resolveFogParallax` and visual defaults that can be reused for non-fog parallax
  experiments. The helpers keep working even when `fog.enabled === false`, allowing callers to share drift math or noise shapes
  without activating the fog renderer.
- `scripts/fogMask.js`: ships `resolveFogTileMask`, `buildTileVisibilityMap`, and `buildVisibilityMask` for any gameplay system
  that needs consistent frontier/unseen tiles. These functions do not change rendering state and remain safe to call even when
  fog layers are fully disabled; rely on them when toggling visuals on/off for QA.
