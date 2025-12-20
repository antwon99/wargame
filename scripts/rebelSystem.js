/**
 * Rebel system utilities for spawning and tracking rebel camps near the kingdom frontier.
 * Designed to be DOM-free so both the browser runtime and Node-based tests can exercise
 * the logic without heavy environment dependencies.
 */
(function (global) {
    /**
     * Determine whether a tile has been marked as a rebel camp.
     * @param {object} tile tile payload from the overworld map.
     * @returns {boolean} true when the tile represents a rebel camp.
     */
    function isRebelCampTile(tile) {
        if (!tile) return false;
        if (tile.isRebelCamp) return true;
        const type = typeof tile.type === 'string' ? tile.type.toLowerCase() : '';
        return type === 'rebelcamp' || type === 'rebel camp';
    }

    function getHexImpl(gameState) {
        return (gameState && gameState.Hex) || global.Hex;
    }

    function ensureKey(tile) {
        if (!tile) return null;
        if (tile.hex && typeof tile.hex.toString === 'function') return tile.hex.toString();
        if (typeof tile.toString === 'function') return tile.toString();
        return null;
    }

    /**
     * Spawns a rebel camp on a tile near the edge of revealed territory.
     * Attempts to pick a tile reasonably close to the player's current area.
     * Returns the tile object (or null if no suitable tile was found).
     * @param {object} gameState live game state containing overworld data.
     * @param {object} [options] optional configuration (currently unused placeholder).
     * @returns {object|null} rebel tile reference or null when placement fails.
     */
    function spawnRebelCampNearFrontier(gameState, options = {}) { // eslint-disable-line no-unused-vars
        const hexes = gameState?.overworld?.hexes;
        if (!hexes || typeof hexes.forEach !== 'function') return null;
        const HexImpl = getHexImpl(gameState);
        if (!HexImpl || typeof HexImpl.neighbor !== 'function') return null;

        const candidates = [];
        hexes.forEach((data) => {
            const tile = data || {};
            if (!tile.hex || isRebelCampTile(tile) || tile.type === 'castle') return;
            let hasFrontier = false;
            for (let dir = 0; dir < 6; dir += 1) {
                const neighbor = HexImpl.neighbor(tile.hex, dir);
                if (!hexes.has(neighbor.toString())) {
                    hasFrontier = true;
                    break;
                }
            }
            if (hasFrontier) candidates.push(tile);
        });

        if (!candidates.length) return null;

        const index = Math.floor(Math.random() * candidates.length);
        const chosen = candidates[index];
        chosen.prevType = chosen.prevType || chosen.type || 'field';
        chosen.type = 'rebelcamp';
        chosen.isRebelCamp = true;
        chosen.owner = 'rebel';
        const key = ensureKey(chosen);
        if (key && typeof hexes.set === 'function') {
            hexes.set(key, chosen);
        }
        return chosen;
    }

    /**
     * Returns an array of all rebel camp tiles currently on the map.
     * @param {object} gameState live game state containing overworld data.
     * @returns {Array} list of rebel camp tile payloads.
     */
    function getAllRebelCamps(gameState) {
        const hexes = gameState?.overworld?.hexes;
        if (!hexes || typeof hexes.forEach !== 'function') return [];
        const rebels = [];
        hexes.forEach((tile) => {
            if (isRebelCampTile(tile)) rebels.push(tile);
        });
        return rebels;
    }

    const api = {
        spawnRebelCampNearFrontier,
        isRebelCampTile,
        getAllRebelCamps
    };

    global.RebelSystem = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
