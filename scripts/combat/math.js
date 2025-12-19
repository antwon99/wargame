/**
 * Pure combat math helpers kept separate from DOM and platform hooks so tests
 * can reason about rewards, penalties, and stat derivations without wiring
 * browser globals.
 */

/** Percentage of wartime gold the crown siphons as a royal levy. */
export const WAR_TAX_RATE = 0.15;

/** Definitions for buildable structures in combat mode. */
export const COMBAT_BUILDINGS = {
    // Castle now has income:5 and prodRate:4.0
    CASTLE: { id: 'castle', char: '🏰', hp: 3000, dmg: 50, range: 4, rate: 1.0, income: 5, prodRate: 4.0 },
    MINE:   { id: 'mine',   char: '🟡', cost: 40, hp: 300, income: 8, rate: 3.0 },
    BARRACKS:{ id: 'barracks', char: '⚔️', cost: 75, hp: 500, spawn: 'soldier', rate: 5.0 },
    RANGE:  { id: 'range',  char: '🏹', cost: 100, hp: 250, spawn: 'archer', rate: 4.5 },
    TOWER:  { id: 'tower',  char: '🛡️', cost: 120, hp: 1000, dmg: 40, range: 4, rate: 0.8 },
    LAIR:   { id: 'lair',   char: '🌋', cost: 0, hp: 1500, spawn: 'dragon', rate: 12.0 },
    MYSTERY:{ id: 'mystery', char: '❓', cost: 25 },
    ROCKS:  { id: 'rocks', char: '🪨', hp: 150 }
};

/** Base unit stats before upgrades are applied. */
export const UNITS = {
    soldier: { hp: 150, dmg: 12, speed: 2.0, range: 1, char: '⚔️' },
    archer:  { hp: 70,  dmg: 18, speed: 1.8, range: 3, char: '🏹' },
    dragon:  { hp: 1200, dmg: 80, speed: 1.5, range: 2, char: '🐲' }
};

/**
 * Compute the net gold delta after applying the royal war tax.
 * A zero or negative input returns zero tax so callers can safely
 * forward resource-poor outcomes without additional checks.
 * @param {number} goldDelta gross gold change from the outcome.
 * @returns {{ net: number, tax: number }} net gold after tax and the tax amount.
 */
export function applyRoyalWarTax(goldDelta) {
    const gross = Math.max(0, Math.floor(goldDelta || 0));
    const tax = Math.floor(gross * WAR_TAX_RATE);
    return { net: gross - tax, tax };
}

/**
 * Compute the entry fee for launching a war.
 * Scaling accounts for both difficulty and the current calendar month so long-run
 * campaigns still feel the mounting logistical strain of mobilizing armies.
 * @param {object} game current game object (difficulty may influence future fees).
 * @returns {number} gold required to initiate battle.
 */
export function computeWarEntryFee(game) { // eslint-disable-line no-unused-vars
    const difficulty = Math.max(0, Number.isFinite(game?.difficulty) ? game.difficulty : 0);
    const month = Math.max(1, game?.timekeeper?.getCalendar?.().month || 1);
    const halfMonthPressure = Math.floor((month - 1) / 2); // +1 fee every two weeks of campaign time
    const yearPressure = Math.floor((month - 1) / 12) * 5; // bump when looping the calendar
    const base = 10;
    const fee = base + (difficulty * 12) + halfMonthPressure * 3 + yearPressure;
    return Math.max(0, Math.floor(fee));
}

/**
 * Calculate AI combat prep knobs that scale with campaign duration and difficulty.
 * Exposed for tests to verify long-run pacing without wiring full DOM state.
 * @param {object} game current game object.
 * @returns {{ gold: number, nextMove: number }} derived starting gold pool and initial decision cadence.
 */
export function deriveAIPrep(game) {
    const cal = game?.timekeeper?.getCalendar?.();
    const monthPressure = Math.floor(((cal?.month || 1) - 1) / 2);
    const gold = 320 + (Math.max(0, game?.difficulty || 0) * 140) + (monthPressure * 25);
    const nextMove = Math.max(1.6, 2.6 - Math.min(1.0, (game?.difficulty || 0) * 0.08));
    return { gold, nextMove };
}

/**
 * Compute a player's unit statistics with upgrade multipliers applied.
 * @param {object} game current game object containing upgrade levels.
 * @param {string} type unit id.
 * @returns {object} derived stat block.
 */
export function getUnitStats(game, type) {
    const base = UNITS[type];
    if(!base) return { hp: 100, dmg: 10, speed: 1, range: 1 };
    if (type === 'soldier' || type === 'archer') {
        const level = Number(game.upgrades?.[type] ?? 1);
        const multi = 1 + ((level - 1) * 0.2);
        return { ...base, hp: base.hp * multi, dmg: base.dmg * multi };
    }
    return base;
}

/**
 * Resolve structure statistics for the specified owner, applying defense upgrades when appropriate.
 * @param {object} game current game object containing upgrade levels.
 * @param {string} type building id.
 * @param {string} owner owner key (player|enemy).
 * @returns {object} structure definition merged with modifiers.
 */
export function getBuildingStats(game, type, owner) {
    const def = COMBAT_BUILDINGS[type.toUpperCase()];
    if(owner !== 'player') return def;
    if(type === 'tower' || type === 'castle') {
        const level = Number(game.upgrades?.defense ?? 1);
        const multi = 1 + ((level - 1) * 0.25);
        return { ...def, hp: def.hp * multi, dmg: def.dmg * multi };
    }
    return def;
}

/**
 * Apply the player's production upgrades to a baseline spawn rate.
 * @param {object} game current game object containing production upgrades.
 * @param {number} baseRate base spawn time in seconds.
 * @returns {number} adjusted spawn rate.
 */
export function getSpawnRate(game, baseRate) {
    const level = Number(game.upgrades?.production ?? 1);
    const multi = Math.pow(0.9, level - 1);
    return baseRate * multi;
}

/**
 * Calculate the gold penalty for losing a war. The penalty is the greater of a
 * percentage of current gold or a small flat fee so defeats always sting, but
 * it is capped at the player's available gold to prevent negative balances.
 * @param {object} game current game object.
 * @returns {number} gold to deduct.
 */
export function computeDefeatGoldPenalty(game) {
    const availableGold = Math.max(0, Math.floor(game.gold || 0));
    const percentPenalty = Math.floor(availableGold * 0.15);
    const flatPenalty = 10;
    return Math.min(availableGold, Math.max(percentPenalty, flatPenalty));
}

/**
 * Translate a victory into concrete resource payouts, returning the net gold
 * after applying the royal levy alongside the base reward numbers for HUD
 * messaging.
 * @param {object} game current game object.
 * @returns {{ gold: number, wood: number, levy: number }} resources earned and the gold taxed away.
 */
export function calculateVictoryRewards(game) {
    const cal = game?.timekeeper?.getCalendar?.();
    const eraBonus = Math.floor(((cal?.month || 1) - 1) / 3);
    const baseGold = 40 + (game.difficulty * 10) + (eraBonus * 5);
    const baseWood = 50 + (game.difficulty * 8) + (eraBonus * 5);
    const { net: gold, tax: levy } = applyRoyalWarTax(baseGold);
    return { gold, wood: baseWood, levy };
}

/**
 * Calculate the gold position after a defeat, combining the defeat penalty and
 * a subsequent royal levy on the remaining treasury.
 * @param {object} game current game object.
 * @returns {{ penalty: number, levy: number, remaining: number }} structured gold deltas.
 */
export function calculateDefeatGoldOutcome(game) {
    const penalty = computeDefeatGoldPenalty(game);
    const remainingAfterPenalty = Math.max(0, Math.floor((game.gold || 0) - penalty));
    const { net: remaining, tax: levy } = applyRoyalWarTax(remainingAfterPenalty);
    return { penalty, levy, remaining };
}

/**
 * Summarize overworld losses for a given war outcome so UI overlays can surface
 * a player-facing recap without duplicating string logic across branches.
 * @param {string} outcomeLabel canonical outcome label (e.g., "Defeat").
 * @param {{counts:{scorched:number, rebel:number}}} lossReport aggregated loss data.
 * @returns {string} formatted summary sentence.
 */
export function formatLossSummary(outcomeLabel, lossReport = { counts: {} }) {
    const counts = lossReport.counts || {};
    const segments = [];
    if (counts.scorched) segments.push(`${counts.scorched} tile${counts.scorched === 1 ? '' : 's'} scorched`);
    if (counts.rebel) segments.push(`${counts.rebel} seized by rebels`);
    const baseLabel = outcomeLabel || 'Outcome';
    const prefix = `${baseLabel[0].toUpperCase()}${baseLabel.slice(1).toLowerCase()}`;
    return segments.length > 0 ? `${prefix}: ${segments.join(', ')}` : `${prefix}: No land lost`;
}

// CommonJS compatibility for Node-based tests while preserving ESM exports for bundlers/browsers.
if (typeof module !== 'undefined') {
    module.exports = {
        WAR_TAX_RATE,
        COMBAT_BUILDINGS,
        UNITS,
        applyRoyalWarTax,
        computeWarEntryFee,
        deriveAIPrep,
        getUnitStats,
        getBuildingStats,
        getSpawnRate,
        computeDefeatGoldPenalty,
        calculateVictoryRewards,
        calculateDefeatGoldOutcome,
        formatLossSummary
    };
}
