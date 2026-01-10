import { RebelSystem } from '../rebelSystem.js';
import { TutorialHandler } from '../tutorialHandler.js';
import { getTileKey } from '../utils/tileKey.js';

/**
 * Normalize a combat target tile so combat entry flows share the same targeting logic.
 * Resolves the freshest overworld tile payload when possible and annotates rebel status.
 * @param {object} game live game state singleton.
 * @param {object|null} tile overworld tile payload or coordinate reference.
 * @returns {{targetTile: object|null, targetKey: string|null, wasRebel: boolean}} normalized target data.
 */
function resolveAttackTarget(game, tile) {
    if (!tile) {
        return { targetTile: null, targetKey: null, wasRebel: false };
    }

    const initialKey = getTileKey(tile);
    const resolvedTile = initialKey && game?.overworld?.hexes?.get?.(initialKey)
        ? game.overworld.hexes.get(initialKey)
        : tile;
    const resolvedKey = getTileKey(resolvedTile) || initialKey;
    const isTutorialCamp = typeof TutorialHandler?.isFrontierSweepCamp === 'function'
        ? TutorialHandler.isFrontierSweepCamp(resolvedTile, game)
        : false;
    const isRebelCamp = RebelSystem?.isRebelCampTile?.(resolvedTile) || isTutorialCamp;

    return {
        targetTile: resolvedTile,
        targetKey: resolvedKey,
        wasRebel: !!isRebelCamp
    };
}

/**
 * Start combat from a specific overworld tile using shared attack normalization.
 * Guards against non-overworld entry and seeds pending clear metadata for combat rewards.
 * @param {object} game live game state singleton.
 * @param {object|null} tile overworld tile payload or coordinate reference.
 * @param {Event} [clickEvt] originating click event for FX anchoring.
 * @returns {boolean} true when combat was started, false when suppressed.
 */
function beginCombatFromTile(game, tile, clickEvt) {
    if (!game) return false;

    if (game.state !== 'OVERWORLD') {
        const warning = `Attack suppressed: expected OVERWORLD, found ${game.state}.`;
        if (typeof game.logBootstrapWarning === 'function') {
            game.logBootstrapWarning(warning);
        } else {
            console.warn(warning);
        }
        const notification = {
            id: 'attack-state-guard',
            title: 'Attack Unavailable',
            lines: [`Cannot start battle while in ${game.state} mode.`],
            tone: 'warning'
        };
        if (typeof game.enqueueNotification === 'function') {
            game.enqueueNotification(notification);
        } else if (typeof game.spawnTxt === 'function') {
            const HexImpl = game.Hex || globalThis.Hex;
            if (typeof HexImpl === 'function') {
                game.spawnTxt(new HexImpl(0, 0), 'Attack Unavailable', '#ef476f');
            }
        }
        if (game.allowAttackStateCorrection === true) {
            game.state = 'OVERWORLD';
            game.showOverworldUI?.();
        } else {
            return false;
        }
    }

    const { targetTile, targetKey, wasRebel } = resolveAttackTarget(game, tile);

    if (targetTile) {
        game.pendingClearTile = targetTile;
        game.pendingClearTileKey = targetKey || null;
        game.pendingClearTileWasRebel = wasRebel;
    } else {
        game.pendingClearTile = null;
        game.pendingClearTileKey = null;
        game.pendingClearTileWasRebel = null;
    }

    if (typeof game.startWar === 'function') {
        game.startWar(clickEvt);
    }

    return true;
}

export { beginCombatFromTile, resolveAttackTarget };
