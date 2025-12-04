/**
 * Shared overworld constants for tile metadata and income definitions.
 * Separated for reuse across core gameplay logic and node-based tests.
 */
export const OVERWORLD_TILES = {
    CASTLE: { id: 'castle', color: '#445', char: '🏰', income: { gold: 2, wood: 1 } },
    FIELD: { id: 'field', color: '#90be6d', char: '🌾', income: {} },
    FOREST: { id: 'forest', color: '#2d6a4f', char: '🌲', income: { wood: 1 } },
    TOWN: { id: 'town', color: '#5e548e', char: '🏠', income: { gold: 2 } },
    SCORCHED: { id: 'scorched', color: '#3b2a2a', char: '🔥', income: {} },
    REBEL: { id: 'rebel', color: '#a4161a', char: '⚔️', income: {} },
    REBELCAMP: { id: 'rebelcamp', color: '#7f1d1d', char: '🏴', income: {} }
};

export default OVERWORLD_TILES;
