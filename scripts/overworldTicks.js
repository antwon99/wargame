import { OVERWORLD_TILES } from './overworldConfig.js';
import { buildClusterBonusMap, DEFAULT_CLUSTER_RATE, normalizeOverworldHexKey } from './overworldAdjacency.js';

/**
 * Calculate and apply overworld income for a single tick.
 * Expects a game-like object exposing economy fields, tile maps, and UI hooks.
 * @param {object} game mutable game state with resources, overworld map, and timekeeper.
 * @param {object} [options] optional dependencies for mandate dispatch and UI helpers.
 * @param {object} [options.uiBindings] mandate rendering hooks passed to the manager.
 * @param {object} [options.mandateManager] async imperial mandate tick router.
 * @param {object} [options.imperialMandates] legacy mandate API fallback.
 */
export function applyOverworldIncome(game, options = {}) {
    if (!game?.overworld?.hexes) return;

    const clusterBonuses = buildClusterBonusMap(game.overworld.hexes, {
        baseRate: game.research?.bonuses?.clusterBaseRate ?? DEFAULT_CLUSTER_RATE,
        reclamationRate: game.research?.bonuses?.landReclamationClusterBonus ?? 0
    });
    game.overworld.clusterBonuses = clusterBonuses;

    let goldInc = 0;
    let woodInc = 0;
    let favorInc = 0;
    for (const [, d] of game.overworld.hexes) {
        const owner = (d.owner || '').toLowerCase();
        if (owner === 'scorched' || owner === 'rebel') continue;

        const def = OVERWORLD_TILES[d.type?.toUpperCase()];
        if (!def) continue;
        const townBonus = d.type === 'town' ? game.research?.bonuses?.townGoldBonus || 0 : 0;
        const forestBonus = d.type === 'forest' ? game.research?.bonuses?.forestWoodBonus || 0 : 0;
        const clusterKey = normalizeOverworldHexKey(d);
        const cluster = clusterKey ? clusterBonuses.get(clusterKey) : null;
        const clusterGoldBonus = cluster?.goldBonus || 0;
        const clusterWoodBonus = cluster?.woodBonus || 0;

        if (def.income.gold) goldInc += def.income.gold + townBonus + clusterGoldBonus;
        if (def.income.wood) woodInc += def.income.wood + forestBonus + clusterWoodBonus;
        if (def.favor) favorInc += def.favor;
        if (typeof def.onIncome === 'function') def.onIncome(game, d.hex || d);
    }

    const multi = typeof game.getIncomeMulti === 'function' ? game.getIncomeMulti() : 1;
    goldInc = Math.floor(goldInc * multi);
    woodInc = Math.floor(woodInc * multi);

    game.gold += goldInc;
    game.wood += woodInc;
    if (favorInc) {
        const baseFavor = Number.isFinite(game.imperialFavor) ? game.imperialFavor : 5;
        const clamped = Math.min(10, Math.max(1, baseFavor + favorInc));
        game.imperialFavor = clamped;
    }
    if ((goldInc > 0 || woodInc > 0 || favorInc !== 0) && typeof game.spawnTxt === 'function') {
        const Hex = game.Hex;
        const origin = typeof Hex === 'function' ? new Hex(0, 0) : { q: 0, r: 0, s: 0 };
        const lines = [`+${goldInc}g  +${woodInc}w`];
        if (favorInc) lines.push(`+${favorInc} Favor`);
        game.spawnTxt(origin, lines.join('  '), '#fff');
    }
    if (game.timekeeper?.advance) game.timekeeper.advance(1);
    if (typeof game.updateHUD === 'function') game.updateHUD();
    if (typeof game.updateUpgradeMenu === 'function') game.updateUpgradeMenu();

    const uiBindings = options.uiBindings || {};
    if (options.mandateManager?.advanceTick) {
        options.mandateManager.advanceTick(game, uiBindings);
    } else if (options.imperialMandates?.recordEvent) {
        options.imperialMandates.recordEvent('tick', { ticks: 1, gameState: game });
    }
}

/**
 * Advance the overworld timer by a delta, applying income and mandate ticks
 * when the interval elapses. Paused states skip timer accumulation entirely.
 * @param {object} game mutable game state with an overworld timer and pause flag.
 * @param {number} dt delta time in seconds to advance.
 * @param {object} [options] optional dependencies forwarded to {@link applyOverworldIncome}.
 * @returns {boolean} true when a tick was applied this call.
 */
export function advanceOverworldTimer(game, dt, options = {}) {
    if (!game || game.paused) return false;
    const tickRate = game.overworld?.tickRate ?? 0;
    if (tickRate <= 0) return false;

    game.overworld.timer = (game.overworld?.timer || 0) + dt;
    if (game.overworld.timer < tickRate) return false;

    game.overworld.timer = 0;
    applyOverworldIncome(game, options);
    return true;
}

export default applyOverworldIncome;
