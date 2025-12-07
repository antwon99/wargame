import { OVERWORLD_TILES } from './overworldConfig.js';
import { TILE_VISIBILITY } from './fogMask.js';

/**
 * Render the overworld layer tiles and claimable borders while invoking a per-tile
 * fog/shroud hook immediately after each tile is painted. The hook defaults to a
 * no-op so callers can opt into custom fog visuals without altering the base draw
 * order. Emits a throttled warning if no tiles are drawn to flag fog-only frames
 * without interrupting the render loop.
 * @param {{hexes: Map<string, {hex:Object, type:string}>, claimable: Map<string, number>}} overworld
 * map collection containing explored and claimable tiles.
 * @param {{layout:Object, drawHex:Function, parseKey:Function, drawTileFog?:Function, showClaimCosts?:boolean, tileVisibility?:Map<string,string>|Function}} options
 * drawing utilities and layout configuration for the current frame. The optional
 * showClaimCosts flag enables debug-only cost stamps on claimable borders; the
 * default rendering omits the labels to keep the map clean. A tileVisibility map
 * or resolver function can be provided to feed fog overlays with the current
 * unseen/seen/visible state per coordinate.
 */
export function drawOverworldTiles(
    overworld,
    {
        layout,
        drawHex,
        parseKey,
        drawTileFog = () => {},
        showClaimCosts = false,
        tileVisibility,
        ambienceEnabled = true,
        ambienceLayersEnabled = true
    }
) {
    let drawnTiles = 0;
    const resolveTileVisibility = typeof tileVisibility === 'function'
        ? tileVisibility
        : (tile, key) => (tileVisibility instanceof Map ? tileVisibility.get(key) : tile?.visibility);

    overworld.hexes.forEach((tile) => {
        const def = OVERWORLD_TILES[tile.type.toUpperCase()];
        const key = tile.hex?.toString ? tile.hex.toString() : undefined;
        const visibility = resolveTileVisibility(tile, key) || TILE_VISIBILITY.VISIBLE;
        const fogState = {
            visibility,
            isUnseen: visibility === TILE_VISIBILITY.UNSEEN,
            isSeen: visibility === TILE_VISIBILITY.SEEN,
            isVisible: visibility === TILE_VISIBILITY.VISIBLE,
            ambienceEnabled: ambienceEnabled !== false,
            ambienceLayersEnabled: ambienceLayersEnabled !== false
        };
        if (def) {
            drawHex(layout, tile.hex, def.color, '#264653', def.char);
            drawnTiles++;
        }
        drawTileFog(tile.hex, tile, visibility, fogState);
    });

    if (drawnTiles === 0) {
        if (!drawOverworldTiles._warnedAboutEmptyTiles) {
            console.warn('[OverworldRenderer] No overworld tiles were drawn this frame; continuing with fog backdrop only.');
            drawOverworldTiles._warnedAboutEmptyTiles = true;
        }
    } else if (drawOverworldTiles._warnedAboutEmptyTiles) {
        drawOverworldTiles._warnedAboutEmptyTiles = false;
    }

    const shouldStampCosts = Boolean(showClaimCosts);
    overworld.claimable.forEach((cost, key) => {
        const claimLabel = shouldStampCosts ? `${cost}w` : '';
        drawHex(layout, parseKey(key), 'rgba(255,255,255,0.05)', '#333', '', claimLabel);
    });
}

drawOverworldTiles._warnedAboutEmptyTiles = false;
