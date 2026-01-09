/**
 * Rebel system utilities for spawning and tracking rebel camps near the kingdom frontier.
 * Designed to be DOM-free so both the browser runtime and Node-based tests can exercise
 * the logic without heavy environment dependencies.
 */
import { OVERWORLD_RESTORE_WEIGHTS, rollWeightedTerrainType } from './overworldConfig.js';
import { getTileKey } from './utils/tileKey.js';
/**
 * Build the rebel system API for spawning and tracking rebel camps.
 * @param {Window|Object} [global] host scope for optional Hex access.
 * @returns {Object} rebel system helpers.
 */
function createRebelSystem(global = typeof window !== 'undefined' ? window : globalThis) {
    const REBEL_CAMP_TYPE = 'rebelcamp';
    const DEFAULT_REBEL_SPREAD = {
        /** Base daily chance for each rebel camp to expand. */
        baseChance: 0.02,
        /** Additional chance gained per day elapsed. */
        dailyGrowth: 0.002,
        /** Hard ceiling to keep spread from becoming guaranteed. */
        maxChance: 0.25
    };

    /**
     * Determine whether a tile has been marked as a rebel camp.
     * @param {object} tile tile payload from the overworld map.
     * @returns {boolean} true when the tile represents rebel presence.
     */
    function isRebelCampTile(tile) {
        if (!tile) return false;
        if (tile.isRebelCamp) return true;
        if (tile.owner === 'rebel') return true;
        const type = typeof tile.type === 'string' ? tile.type.toLowerCase() : '';
        return type === 'rebelcamp' || type === 'rebel camp';
    }

    /**
     * Roll a non-rebel terrain type using the restore-only weights.
     * @param {function} rng random number generator returning [0,1).
     * @returns {string} selected terrain type.
     */
    function rollReplacementTerrain(rng = Math.random) {
        return rollWeightedTerrainType(OVERWORLD_RESTORE_WEIGHTS, rng);
    }

    function getHexImpl(gameState) {
        return (gameState && gameState.Hex) || global.Hex;
    }

    /**
     * Compute axial hex distance between two coordinates with a manual fallback.
     * @param {object} a starting hex coordinate.
     * @param {object} b ending hex coordinate.
     * @param {object} HexImpl hex helper implementation.
     * @returns {number} axial distance between the two coordinates.
     */
    function getHexDistance(a, b, HexImpl) {
        if (HexImpl?.distance) return HexImpl.distance(a, b);
        if (!a || !b) return Number.POSITIVE_INFINITY;
        const dq = Math.abs((a.q ?? 0) - (b.q ?? 0));
        const dr = Math.abs((a.r ?? 0) - (b.r ?? 0));
        const ds = Math.abs((a.s ?? 0) - (b.s ?? 0));
        return (dq + dr + ds) / 2;
    }

    /**
     * Spawn a starter rebel camp near the castle without replacing starter terrain.
     * Prefers empty neighbor slots around the castle, then falls back to the closest
     * unseen frontier slot so forests/towns remain intact.
     * @param {object} gameState live game state containing overworld data.
     * @param {object} [options] optional configuration for deterministic tests.
     * @param {function} [options.rng] random number generator returning [0,1).
     * @returns {object|null} rebel camp tile payload or null when placement fails.
     */
    function spawnStarterRebelCampNearCastle(gameState, options = {}) {
        const hexes = gameState?.overworld?.hexes;
        if (!hexes || typeof hexes.forEach !== 'function') return null;
        const HexImpl = getHexImpl(gameState);
        if (!HexImpl || typeof HexImpl.neighbor !== 'function') return null;

        const rng = typeof options.rng === 'function' ? options.rng : Math.random;
        let castleHex = null;
        hexes.forEach((tile) => {
            if (!castleHex && tile?.type === 'castle' && tile.hex) {
                castleHex = tile.hex;
            }
        });
        if (!castleHex && HexImpl) {
            try {
                castleHex = new HexImpl(0, 0);
            } catch (error) {
                castleHex = null;
            }
        }
        if (!castleHex) return null;

        const openNeighbors = [];
        for (let dir = 0; dir < 6; dir += 1) {
            const neighbor = HexImpl.neighbor(castleHex, dir);
            const key = neighbor?.toString?.();
            if (key && !hexes.has(key)) {
                openNeighbors.push(neighbor);
            }
        }

        let targetHex = null;
        if (openNeighbors.length > 0) {
            targetHex = openNeighbors[Math.floor(rng() * openNeighbors.length)];
        } else {
            const frontierSlots = new Map();
            hexes.forEach((tile) => {
                if (!tile?.hex) return;
                for (let dir = 0; dir < 6; dir += 1) {
                    const neighbor = HexImpl.neighbor(tile.hex, dir);
                    const key = neighbor?.toString?.();
                    if (!key || hexes.has(key) || frontierSlots.has(key)) continue;
                    frontierSlots.set(key, neighbor);
                }
            });
            if (!frontierSlots.size) return null;

            let minDistance = Number.POSITIVE_INFINITY;
            frontierSlots.forEach((hex) => {
                const distance = getHexDistance(castleHex, hex, HexImpl);
                if (distance < minDistance) minDistance = distance;
            });
            const closest = [];
            frontierSlots.forEach((hex) => {
                const distance = getHexDistance(castleHex, hex, HexImpl);
                if (distance === minDistance) closest.push(hex);
            });
            if (!closest.length) return null;
            targetHex = closest[Math.floor(rng() * closest.length)];
        }

        if (!targetHex) return null;
        const rebelTile = {
            hex: targetHex,
            type: REBEL_CAMP_TYPE,
            owner: 'rebel',
            isRebelCamp: true,
            prevType: 'field'
        };
        const key = getTileKey(rebelTile);
        if (key && typeof hexes.set === 'function') {
            hexes.set(key, rebelTile);
        }
        return rebelTile;
    }

    /**
     * Compute the per-day rebel spread chance, scaling with elapsed days.
     * @param {object} gameState live game state containing a timekeeper (optional).
     * @param {object} [options] optional overrides for testing.
     * @param {number} [options.ticks] absolute tick count override (days elapsed).
     * @param {number} [options.baseChance] starting spread chance per day.
     * @param {number} [options.dailyGrowth] additional chance gained per day.
     * @param {number} [options.maxChance] upper bound for the spread chance.
     * @returns {number} chance in the [0,1] range.
     */
    function getRebelSpreadChance(gameState, options = {}) {
        const ticks = Number.isFinite(options.ticks)
            ? options.ticks
            : (Number.isFinite(gameState?.timekeeper?.ticks) ? gameState.timekeeper.ticks : 0);
        const baseChance = Number.isFinite(options.baseChance) ? options.baseChance : DEFAULT_REBEL_SPREAD.baseChance;
        const dailyGrowth = Number.isFinite(options.dailyGrowth) ? options.dailyGrowth : DEFAULT_REBEL_SPREAD.dailyGrowth;
        const maxChance = Number.isFinite(options.maxChance) ? options.maxChance : DEFAULT_REBEL_SPREAD.maxChance;
        const scaled = baseChance + Math.max(0, ticks) * dailyGrowth;
        return Math.min(maxChance, Math.max(0, scaled));
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
        const key = getTileKey(chosen);
        if (key && typeof hexes.set === 'function') {
            hexes.set(key, chosen);
        }
        return chosen;
    }

    /**
     * Attempt to spread rebel camps into adjacent player tiles.
     * Each camp rolls a daily chance that scales up with the campaign duration.
     * @param {object} gameState live game state containing overworld data.
     * @param {object} [options] optional configuration for deterministic tests.
     * @param {function} [options.rng] random number generator returning [0,1).
     * @param {number} [options.chance] forced chance override to bypass scaling.
     * @param {Set<string>|Array<string>|string} [options.protectedKeys] rebel camp keys to skip for spread.
     * @returns {Array} list of newly converted rebel tiles.
     */
    function spreadRebelCamps(gameState, options = {}) {
        const hexes = gameState?.overworld?.hexes;
        if (!hexes || typeof hexes.forEach !== 'function') return [];
        const HexImpl = getHexImpl(gameState);
        if (!HexImpl || typeof HexImpl.neighbor !== 'function') return [];

        const rng = typeof options.rng === 'function' ? options.rng : Math.random;
        const chance = Number.isFinite(options.chance) ? options.chance : getRebelSpreadChance(gameState);
        const rebels = getAllRebelCamps(gameState);
        const conversions = [];
        const protectedKeys = options.protectedKeys instanceof Set
            ? options.protectedKeys
            : new Set(Array.isArray(options.protectedKeys)
                ? options.protectedKeys
                : (options.protectedKeys ? [options.protectedKeys] : []));

        rebels.forEach((rebelTile) => {
            const rebelKey = getTileKey(rebelTile);
            if (rebelKey && protectedKeys.has(rebelKey)) return;
            if (rng() >= chance) return;
            const candidates = [];
            for (let dir = 0; dir < 6; dir += 1) {
                const neighbor = HexImpl.neighbor(rebelTile.hex, dir);
                const neighborKey = neighbor.toString();
                const tile = hexes.get(neighborKey);
                if (!tile || isRebelCampTile(tile) || tile.type === 'castle' || tile.type === 'water') continue;
                if ((tile.owner || '').toLowerCase() !== 'player') continue;
                candidates.push(tile);
            }
            if (!candidates.length) return;

            const target = candidates[Math.floor(rng() * candidates.length)];
            const updated = {
                ...target,
                prevType: target.prevType || target.type || 'field',
                type: REBEL_CAMP_TYPE,
                isRebelCamp: true,
                owner: 'rebel'
            };
            const key = getTileKey(updated);
            if (key && typeof hexes.set === 'function') {
                hexes.set(key, updated);
            }
            conversions.push(updated);
        });

        return conversions;
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

    /**
     * Clear a rebel camp, restoring it to a normal terrain roll.
     * @param {object} tile rebel tile payload to convert.
     * @param {object} gameState live game state containing overworld data.
     * @param {object} [options] optional configuration (rng override for tests).
     * @returns {object|null} updated tile payload.
     */
    function restoreRebelTile(tile, gameState, options = {}) {
        if (!tile) return null;
        const rng = typeof options.rng === 'function' ? options.rng : Math.random;
        const type = rollReplacementTerrain(rng);
        const updated = { ...tile, type, owner: 'player', isRebelCamp: false };
        if (type === 'water') updated.isWater = true;
        else if (updated.isWater) delete updated.isWater;
        if (updated.prevType) delete updated.prevType;

        const key = getTileKey(updated);
        if (key && gameState?.overworld?.hexes) {
            gameState.overworld.hexes.set(key, updated);
        }
        return updated;
    }

    const api = {
        spawnRebelCampNearFrontier,
        spawnStarterRebelCampNearCastle,
        isRebelCampTile,
        getAllRebelCamps,
        restoreRebelTile,
        getRebelSpreadChance,
        spreadRebelCamps
    };

    return api;
}

const RebelSystem = createRebelSystem();

/**
 * Register the rebel helpers on the provided global scope.
 * @param {Window|Object} [target] global object to attach RebelSystem to.
 * @returns {Object} rebel system API.
 */
function initRebelSystem(target = typeof window !== 'undefined' ? window : globalThis) {
    if (target) {
        target.RebelSystem = RebelSystem;
    }
    return RebelSystem;
}

export { createRebelSystem, RebelSystem, initRebelSystem };

