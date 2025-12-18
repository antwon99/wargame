import { OVERWORLD_TILES } from './overworldConfig.js';
import { TILE_VISIBILITY } from './visibilityMask.js';

/**
 * Render the overworld layer tiles and claimable borders while invoking a per-tile
 * visibility hook immediately after each tile is painted. The hook defaults to a
 * no-op so callers can opt into custom overlays without altering the base draw
 * order. Emits a throttled warning if no tiles are drawn to flag overlay-only frames
 * without interrupting the render loop.
 * @param {{hexes: Map<string, {hex:Object, type:string}>, claimable: Map<string, number>}} overworld
 * map collection containing explored and claimable tiles.
 * @param {{layout:Object, drawHex:Function, parseKey:Function, drawTileOverlay?:Function, showClaimCosts?:boolean, tileVisibility?:Map<string,string>|Function}} options
 * drawing utilities and layout configuration for the current frame. The optional
 * showClaimCosts flag enables debug-only cost stamps on claimable borders; the
 * default rendering omits the labels to keep the map clean. A tileVisibility map
 * or resolver function can be provided to feed overlays with the current
 * unseen/seen/visible state per coordinate.
 */
export function drawOverworldTiles(
    overworld,
    {
        layout,
        drawHex,
        parseKey,
        drawTileOverlay = () => {},
        showClaimCosts = false,
        tileVisibility
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
        const overlayState = {
            visibility,
            isUnseen: visibility === TILE_VISIBILITY.UNSEEN,
            isSeen: visibility === TILE_VISIBILITY.SEEN,
            isVisible: visibility === TILE_VISIBILITY.VISIBLE
        };
        if (def) {
            drawHex(layout, tile.hex, def.color, '#264653', def.char);
            drawnTiles++;
        }
        drawTileOverlay(tile.hex, tile, visibility, overlayState);
    });

    if (drawnTiles === 0) {
        if (!drawOverworldTiles._warnedAboutEmptyTiles) {
            console.warn('[OverworldRenderer] No overworld tiles were drawn this frame; continuing with overlay-only frame.');
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
