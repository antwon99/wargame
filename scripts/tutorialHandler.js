/**
 * Tutorial handler utilities for isolating guided onboarding logic from core systems.
 * Provides shared state and helpers for the Frontier Sweep flow and related presets.
 */
import { RebelSystem } from './rebelSystem.js';
import { getTileKey } from './utils/tileKey.js';

const DEFAULT_FRONTIER_SWEEP_STATE = {
    /** Stable overworld key for the tutorial rebel camp. */
    targetTileKey: null,
    /** Whether the tutorial rebel camp should ignore spread rolls. */
    spreadImmune: true,
    /** Source label for diagnostics (mandate, script, etc.). */
    source: null,
    /** Enemy level preset applied when the camp was seeded. */
    enemyLevel: null,
    /** Overworld tick when the camp was seeded (if available). */
    issuedTick: null,
    /** Overworld tick when the camp was cleared (if available). */
    completionTick: null
};

/**
 * Build the tutorial handler API for guided onboarding flows.
 * @param {Window|Object} [global] host scope for optional globals.
 * @returns {Object} tutorial handler helpers.
 */
function createTutorialHandler(global = typeof window !== 'undefined' ? window : globalThis) { // eslint-disable-line no-unused-vars
    /**
     * Ensure the tutorial state payload exists and includes the Frontier Sweep defaults.
     * @param {object} gameState live game state reference.
     * @returns {object|null} normalized tutorial state or null when unavailable.
     */
    function ensureTutorialState(gameState) {
        if (!gameState) return null;
        if (!gameState.tutorial || typeof gameState.tutorial !== 'object') {
            gameState.tutorial = {};
        }
        if (!gameState.tutorial.frontierSweep || typeof gameState.tutorial.frontierSweep !== 'object') {
            gameState.tutorial.frontierSweep = { ...DEFAULT_FRONTIER_SWEEP_STATE };
        }
        return gameState.tutorial;
    }

    /**
     * Retrieve the current Frontier Sweep tutorial state without mutating gameState.
     * @param {object} gameState live game state reference.
     * @returns {object} Frontier Sweep state payload.
     */
    function getFrontierSweepState(gameState) {
        const tutorial = gameState?.tutorial;
        if (tutorial?.frontierSweep && typeof tutorial.frontierSweep === 'object') {
            return { ...DEFAULT_FRONTIER_SWEEP_STATE, ...tutorial.frontierSweep };
        }
        return { ...DEFAULT_FRONTIER_SWEEP_STATE };
    }

    /**
     * Persist the tutorial rebel camp key and presets for Frontier Sweep.
     * @param {object} gameState live game state reference.
     * @param {object} rebelTile rebel camp tile payload to track.
     * @param {object} [options] optional metadata overrides.
     * @param {boolean} [options.spreadImmune=true] whether spread immunity should be enforced.
     * @param {string} [options.source] source label for diagnostics.
     * @param {number} [options.enemyLevel] enemy level preset used when spawning the camp.
     * @returns {string|null} recorded tile key or null if unavailable.
     */
    function markFrontierSweepCamp(gameState, rebelTile, options = {}) {
        if (!gameState || !rebelTile) return null;
        const tutorial = ensureTutorialState(gameState);
        if (!tutorial) return null;

        const key = getTileKey(rebelTile);
        if (!key) return null;

        const current = tutorial.frontierSweep || { ...DEFAULT_FRONTIER_SWEEP_STATE };
        tutorial.frontierSweep = {
            ...current,
            targetTileKey: key,
            spreadImmune: options.spreadImmune ?? current.spreadImmune ?? true,
            source: options.source ?? current.source ?? null,
            enemyLevel: Number.isFinite(options.enemyLevel) ? options.enemyLevel : (current.enemyLevel ?? null),
            issuedTick: Number.isFinite(gameState?.timekeeper?.ticks) ? gameState.timekeeper.ticks : current.issuedTick,
            completionTick: current.completionTick ?? null
        };
        return key;
    }

    /**
     * Spawn (or resolve) the tutorial rebel camp for Frontier Sweep and track its key.
     * @param {object} gameState live game state reference.
     * @param {object} [options] passthrough configuration for rebel camp spawning.
     * @returns {object|null} rebel camp tile payload or null when placement fails.
     */
    function spawnFrontierSweepCamp(gameState, options = {}) {
        if (!gameState) return null;
        const tutorial = ensureTutorialState(gameState);
        if (!tutorial) return null;

        const existingKey = tutorial.frontierSweep?.targetTileKey;
        const existingTile = existingKey && gameState?.overworld?.hexes?.get?.(existingKey);
        if (existingTile) return existingTile;

        const rebelTile = RebelSystem?.spawnRebelCampNearFrontier?.(gameState, options) || null;
        if (!rebelTile) return null;

        markFrontierSweepCamp(gameState, rebelTile, {
            spreadImmune: options.spreadImmune,
            source: options.source ?? 'imperial_mandate',
            enemyLevel: options.enemyLevel
        });

        return rebelTile;
    }

    /**
     * Clear the tracked Frontier Sweep rebel camp after it is reclaimed.
     * @param {object} gameState live game state reference.
     * @param {object|string|null} tileOrKey cleared tile payload or key.
     * @returns {boolean} true when the tracked camp was cleared.
     */
    function clearFrontierSweepCamp(gameState, tileOrKey) {
        if (!gameState) return false;
        const tutorial = ensureTutorialState(gameState);
        if (!tutorial) return false;

        const key = typeof tileOrKey === 'string' ? tileOrKey : getTileKey(tileOrKey);
        if (!key || tutorial.frontierSweep?.targetTileKey !== key) return false;

        tutorial.frontierSweep = {
            ...tutorial.frontierSweep,
            targetTileKey: null,
            completionTick: Number.isFinite(gameState?.timekeeper?.ticks) ? gameState.timekeeper.ticks : null
        };
        return true;
    }

    /**
     * Provide a set of rebel camp keys that should ignore daily spread rolls.
     * @param {object} gameState live game state reference.
     * @returns {Set<string>} protected rebel camp keys.
     */
    function getProtectedRebelSpreadKeys(gameState) {
        const state = getFrontierSweepState(gameState);
        const keys = new Set();
        if (state.spreadImmune && state.targetTileKey) {
            keys.add(state.targetTileKey);
        }
        return keys;
    }

    /**
     * Determine whether a tile is the currently tracked Frontier Sweep rebel camp.
     * @param {object} tile overworld tile payload to evaluate.
     * @param {object} gameState live game state reference.
     * @returns {boolean} true when the tile matches the tutorial camp key.
     */
    function isFrontierSweepCamp(tile, gameState) {
        const key = getTileKey(tile);
        if (!key) return false;
        return key === getFrontierSweepState(gameState).targetTileKey;
    }

    return {
        ensureTutorialState,
        getFrontierSweepState,
        markFrontierSweepCamp,
        spawnFrontierSweepCamp,
        clearFrontierSweepCamp,
        getProtectedRebelSpreadKeys,
        isFrontierSweepCamp
    };
}

const TutorialHandler = createTutorialHandler();

/**
 * Register the tutorial handler on the provided global scope.
 * @param {Window|Object} [target] global object to attach TutorialHandler to.
 * @returns {Object} tutorial handler API.
 */
function initTutorialHandler(target = typeof window !== 'undefined' ? window : globalThis) {
    if (target) {
        target.TutorialHandler = TutorialHandler;
    }
    return TutorialHandler;
}

export { createTutorialHandler, TutorialHandler, initTutorialHandler };

if (typeof module !== 'undefined') {
    module.exports = Object.assign(TutorialHandler, {
        TutorialHandler,
        initTutorialHandler,
        createTutorialHandler
    });
}
