import { OVERWORLD_TILES } from './overworldConfig.js';

/**
 * Render the overworld layer tiles and claimable borders while invoking a per-tile
 * fog/shroud hook immediately after each tile is painted. The hook defaults to a
 * no-op so callers can opt into custom fog visuals without altering the base draw
 * order.
 * @param {{hexes: Map<string, {hex:Object, type:string}>, claimable: Map<string, number>}} overworld
 * map collection containing explored and claimable tiles.
 * @param {{layout:Object, drawHex:Function, parseKey:Function, drawTileFog?:Function}} options
 * drawing utilities and layout configuration for the current frame.
 */
export function drawOverworldTiles(overworld, { layout, drawHex, parseKey, drawTileFog = () => {} }) {
    overworld.hexes.forEach((tile) => {
        const def = OVERWORLD_TILES[tile.type.toUpperCase()];
        if (def) drawHex(layout, tile.hex, def.color, '#264653', def.char);
        drawTileFog(tile.hex, tile);
    });

    overworld.claimable.forEach((cost, key) => {
        drawHex(layout, parseKey(key), 'rgba(255,255,255,0.05)', '#333', '', `${cost}w`);
    });
}
