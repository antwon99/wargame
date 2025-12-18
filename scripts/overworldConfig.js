/**
 * Shared overworld constants for tile metadata and income definitions.
 * Separated for reuse across core gameplay logic and node-based tests.
 */
export const OVERWORLD_TILES = {
    CASTLE: { id: 'castle', color: '#445', char: '🏰', income: { gold: 3, wood: 1 } },
    FIELD: { id: 'field', color: '#90be6d', char: '🌾', income: {} },
    FOREST: { id: 'forest', color: '#2d6a4f', char: '🌲', income: { wood: 2 } },
    TOWN: { id: 'town', color: '#5e548e', char: '🏠', income: { gold: 3 } },
    SCORCHED: { id: 'scorched', color: '#3b2a2a', char: '🔥', income: {} },
    REBEL: { id: 'rebel', color: '#a4161a', char: '⚔️', income: {} },
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
            if (typeof game.playSound === 'function') game.playSound('gold');
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
            if (typeof game.playSound === 'function') game.playSound('holy');
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
