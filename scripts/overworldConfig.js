/**
 * Shared overworld constants for tile metadata and income definitions.
 * Separated for reuse across core gameplay logic and node-based tests.
 */
/**
 * Weighted terrain table for overworld claims and rebel camp restoration.
 * Weights are relative (not percentages) and should stay in sync across systems.
 */
export const OVERWORLD_TERRAIN_WEIGHTS = [
    { type: 'field', weight: 45 },
    { type: 'forest', weight: 28 },
    { type: 'town', weight: 16 },
    { type: 'mine', weight: 5 },
    { type: 'shrine', weight: 2 },
    { type: 'ruin', weight: 1 },
    { type: 'water', weight: 8 }
];

/**
 * Weighted terrain table for rebel camp restoration that never rolls rebel camps.
 * Kept separate from claim weights so restore-only tuning stays explicit.
 */
export const OVERWORLD_RESTORE_WEIGHTS = [
    { type: 'field', weight: 45 },
    { type: 'forest', weight: 28 },
    { type: 'town', weight: 16 },
    { type: 'mine', weight: 5 },
    { type: 'shrine', weight: 2 },
    { type: 'ruin', weight: 1 },
    { type: 'water', weight: 8 }
];

/**
 * Roll a terrain type from a weighted table used by overworld expansion.
 * @param {Array<{type: string, weight: number}>} weights weighted terrain entries.
 * @param {function} [rng=Math.random] random number generator returning [0, 1).
 * @returns {string} chosen terrain type string.
 */
export function rollWeightedTerrainType(weights = OVERWORLD_TERRAIN_WEIGHTS, rng = Math.random) {
    const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);
    let pick = rng() * totalWeight;
    for (const entry of weights) {
        if (pick < entry.weight) return entry.type;
        pick -= entry.weight;
    }
    return weights[0]?.type || 'field';
}

export const OVERWORLD_TILES = {
    CASTLE: { id: 'castle', color: '#445', char: '🏰', income: { gold: 3, wood: 1 } },
    FIELD: { id: 'field', color: '#90be6d', char: '🌾', income: {} },
    FOREST: { id: 'forest', color: '#2d6a4f', char: '🌲', income: { wood: 2 } },
    TOWN: { id: 'town', color: '#5e548e', char: '🏠', income: { gold: 3 } },
    SCORCHED: { id: 'scorched', color: '#3b2a2a', char: '🔥', income: {} },
    REBELCAMP: { id: 'rebelcamp', color: '#7f1d1d', char: '🏴', income: {} },
    MINE: {
        id: 'mine',
        color: '#7f5539',
        char: '⛏️',
        income: { gold: 4 },
        onClaim: (game, hex) => {
            if (!game) return;
            game.gold = (game.gold || 0) + 40;
            if (typeof game.spawnTxt === 'function') game.spawnTxt(hex, '+40g', '#ffd166');
            if (typeof game.playSound === 'function') game.playSound('mine');
        }
    },
    SHRINE: {
        id: 'shrine',
        color: '#c9ada7',
        char: '⛪',
        income: {},
        favor: 0.25,
        onClaim: (game, hex) => {
            if (!game) return;
            const base = Number.isFinite(game.imperialFavor) ? game.imperialFavor : 5;
            game.imperialFavor = Math.min(10, Math.max(1, base + 2));
            if (typeof game.spawnTxt === 'function') game.spawnTxt(hex, '+2 Favor', '#ffe066');
            if (typeof game.playSound === 'function') game.playSound('shrine');
        }
    },
    RUIN: {
        id: 'ruin',
        color: '#6c757d',
        char: '🏚️',
        income: { gold: 2 },
        onIncome: (game, hex) => {
            if (!game || !hex) return;
            const roll = Math.random();
            if (roll < 0.2) {
                const bonusGold = 10;
                game.gold = (game.gold || 0) + bonusGold;
                if (typeof game.spawnTxt === 'function') game.spawnTxt(hex, `+${bonusGold}g (ruin cache)`, '#f8f9fa');
            }
        }
    },
    WATER: {
        id: 'water',
        color: '#1c7ed6',
        char: '🌊',
        income: {},
        tooltip: 'Calming waters that slow expansion efficiency but open scenic space.'
    }
};

export default OVERWORLD_TILES;
