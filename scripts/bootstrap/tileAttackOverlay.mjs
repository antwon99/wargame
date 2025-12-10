/**
 * Reposition and toggle the floating Attack overlay so hostile tiles expose a direct battle entry point.
 * The helper anchors to the projected screen position of the selected tile and wires clicks into combat init.
 *
 * @param {object} game live game singleton with projection utilities.
 * @param {object|null} tile selected overworld tile to anchor against.
 */
export function updateTileAttackOverlay(game, tile) {
    const button = game?.tileAttackOverlayBtn
        || (typeof document !== 'undefined' ? document.getElementById('tile-attack-overlay-btn') : null);
    if (!game || !button) return;

    if (!game.tileAttackOverlayBtn) game.tileAttackOverlayBtn = button;

    const isHostile = game.state === 'OVERWORLD'
        && tile
        && (tile.status === 'HOSTILE' || tile.owner === 'enemy' || tile.owner === 'rebel')
        && typeof game.projectHexToScreen === 'function';

    button.classList.toggle('active', !!isHostile);
    button.setAttribute('aria-hidden', isHostile ? 'false' : 'true');

    if (!isHostile) {
        button.style.display = 'none';
        button.onclick = null;
        return;
    }

    const pos = game.projectHexToScreen(tile.hex || tile);
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
        button.style.display = 'none';
        return;
    }

    button.style.display = 'inline-flex';
    button.style.left = `${pos.x}px`;
    button.style.top = `${pos.y - 32}px`;
    button.onclick = (evt) => {
        evt?.stopPropagation?.();
        if (typeof game.beginBattleFromTile === 'function') game.beginBattleFromTile(tile, evt);
    };
}

export default updateTileAttackOverlay;
