const assert = require('assert');

global.localStorage = (() => {
    const store = new Map();
    return {
        getItem: key => store.get(key) || null,
        setItem: (key, value) => store.set(key, value),
        removeItem: key => store.delete(key),
        clear: () => store.clear()
    };
})();

global.Hex = class Hex {
    constructor(q, r, s) { this.q = q; this.r = r; this.s = s; }
    toString() { return `${this.q},${this.r}`; }
};

const Persistence = require('../scripts/persistence.js');

function runTests() {
    const INCOME_TABLE = {
        castle: { gold: 2, wood: 1 },
        town: { gold: 2 },
        forest: { wood: 1 },
        field: {},
        scorched: {},
        rebel: {},
        mine: { gold: 3 },
        shrine: {},
        ruin: { gold: 1 }
    };

    const calcIncome = (hexMap) => {
        let gold = 0;
        let wood = 0;
        hexMap.forEach((tile) => {
            const owner = (tile.owner || '').toLowerCase();
            if (owner === 'scorched' || owner === 'rebel') return;
            const type = typeof tile.type === 'string' ? tile.type.toLowerCase() : '';
            const income = INCOME_TABLE[type] || {};
            if (income.gold) gold += income.gold;
            if (income.wood) wood += income.wood;
        });
        return { gold, wood };
    };

    // Serialize
    const mandateSnapshot = {
        currentTick: 7,
        lastIssuedTick: 6,
        mandates: {
            levy_tithed_gold: {
                status: 'ACTIVE',
                deadlineTick: 21,
                issuedTick: 14,
                metadata: { requiredGold: 180 }
            }
        }
    };

    const notificationStack = {
        queue: [{ id: 'queued', title: 'Queued', lines: ['Awaiting'], duration: 1234 }],
        visible: new Map([
            ['v1', { item: { id: 'live', title: 'Live', lines: ['Active'], duration: 1500, tone: 'warning' } }]
        ])
    };

    const game = {
        gold: 100,
        wood: 50,
        difficulty: 2,
        imperialFavor: 7,
        timekeeper: { ticks: 12, daysPerWeek: 5, weeksPerMonth: 3 },
        upgrades: { soldier: 1 },
        overworld: {
            hexes: new Map([
                ['0,0', { hex: new Hex(0, 0, 0), type: 'castle' }],
                ['1,0', { hex: new Hex(1, 0, -1), type: 'field' }]
            ])
        },
        stats: { totalKills: 5 },
        getNotificationStack: () => notificationStack,
        imperialMandates: { serializeState: () => mandateSnapshot }
    };
    const snap = Persistence.serializeGameState(game);
    assert.strictEqual(snap.overworld.hexes.length, 2);
    assert.strictEqual(snap.stats.totalKills, 5);
    assert.strictEqual(snap.stats.bestKills, 0);
    assert.strictEqual(snap.stats.bestLevel, 0);
    assert.strictEqual(snap.stats.warsFought, 0);
    assert.strictEqual(snap.stats.lastOutcome, 'N/A');
    assert.strictEqual(snap.gold, 100);
    assert.strictEqual(snap.timekeeper.ticks, 12);
    assert.strictEqual(snap.timekeeper.daysPerWeek, 5);
    assert.strictEqual(snap.notifications.length, 2, 'pending notifications should persist');
    assert.strictEqual(snap.mandates.currentTick, mandateSnapshot.currentTick, 'mandate state should persist');

    // Deserialize
    const snapshot = {
        gold: 12,
        wood: 7,
        difficulty: 1,
        upgrades: { soldier: 2 },
        imperialFavor: 3,
        overworld: { hexes: [{ q: 0, r: 0, s: 0, type: 'castle' }] },
        stats: { totalKills: 3, bestDifficulty: 4, warsPlayed: 6 },
        timekeeper: { ticks: 4, daysPerWeek: 6, weeksPerMonth: 2 },
        notifications: [{ id: 'queued', title: 'Queued', lines: ['Awaiting'], duration: 1234 }],
        mandates: mandateSnapshot
    };
    const result = Persistence.deserializeGameState(snapshot, {
        hexFactory: (q, r, s) => new Hex(q, r, s)
    });
    assert.strictEqual(result.overworld.hexes.size, 1);
    const only = Array.from(result.overworld.hexes.values())[0];
    assert.deepStrictEqual(only.hex.q, 0);
    assert.strictEqual(result.stats.totalKills, 3);
    assert.strictEqual(result.stats.bestLevel, 4, 'legacy bestDifficulty should map to bestLevel');
    assert.strictEqual(result.stats.warsFought, 6, 'legacy warsPlayed should map to warsFought');
    assert.strictEqual(result.imperialFavor, 3);
    assert.strictEqual(result.timekeeper.ticks, 4);
    assert.strictEqual(result.timekeeper.daysPerWeek, 6);
    assert.strictEqual(result.notifications.length, 1);
    assert.strictEqual(result.mandates.currentTick, mandateSnapshot.currentTick);

    // Guard against malformed overworld tiles sneaking into state
    const malformedSnapshot = {
        overworld: {
            hexes: [
                { q: 0, r: 0, s: 0, type: 'castle', owner: 'player' },
                { q: 1, r: 0, s: -1, type: 'glitch', owner: 'cheater' },
                { q: 2, r: 0, s: -2, type: 'field', owner: 'bandit' },
                { q: 3, r: 0, s: -3, type: 'shrine', owner: 'REBEL' },
                { q: 'x', r: 0, s: 0, type: 'town', owner: 'neutral' }
            ]
        },
        stats: {}
    };
    const sanitized = Persistence.deserializeGameState(malformedSnapshot, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    assert.strictEqual(sanitized.overworld.hexes.size, 3, 'invalid hex entries should be skipped');
    const sanitizedTypes = Array.from(sanitized.overworld.hexes.values()).map(t => t.type).sort();
    assert.deepStrictEqual(sanitizedTypes, ['castle', 'field', 'shrine'], 'only valid tile ids should survive');
    assert.strictEqual(sanitized.overworld.hexes.get('2,0').owner, null, 'unknown owners should be coerced to null');
    assert.strictEqual(sanitized.overworld.hexes.get('3,0').owner, 'rebel', 'recognized owners should be normalized to lowercase');

    // Validate overworld tiles against the configured tile catalog and clamp owners
    const originalOverworldTiles = global.OVERWORLD_TILES;
    global.OVERWORLD_TILES = {
        CASTLE: { id: 'castle' },
        CUSTOM: { id: 'customtile' },
        REBEL: { id: 'rebel' }
    };

    const configLimitedSnapshot = {
        overworld: {
            hexes: [
                { q: 0, r: 0, s: 0, type: 'CASTLE', owner: 'PLAYER' },
                { q: 1, r: 0, s: -1, type: 'field', owner: 'player' },
                { q: 2, r: 0, s: -2, type: 'customtile', owner: 'BANDIT' },
                { q: 3, r: 0, s: -3, type: 'rebel', owner: 'SCORCHED' },
                { q: 4, r: 0, s: -4, type: 'glitch', owner: 'rebel' }
            ]
        }
    };

    const configSanitized = Persistence.deserializeGameState(configLimitedSnapshot, {
        hexFactory: (q, r, s) => new Hex(q, r, s)
    });

    assert.strictEqual(configSanitized.overworld.hexes.size, 3, 'only tiles present in OVERWORLD_TILES should persist');
    assert.ok(configSanitized.overworld.hexes.has('0,0'), 'configured tile ids should survive case normalization');
    assert.ok(configSanitized.overworld.hexes.has('2,0'), 'custom tile ids should be honored when configured');
    assert.strictEqual(configSanitized.overworld.hexes.get('2,0').owner, null, 'unrecognized owners should be cleared');
    assert.strictEqual(configSanitized.overworld.hexes.get('3,0').owner, 'scorched', 'recognized owners should persist in lowercase');

    global.OVERWORLD_TILES = originalOverworldTiles;

    // Save/Load via mocked storage
    const saveGame = {
        gold: 77,
        wood: 9,
        difficulty: 4,
        upgrades: { soldier: 3 },
        imperialFavor: 9,
        timekeeper: { ticks: 8, daysPerWeek: 7, weeksPerMonth: 4 },
        overworld: { hexes: new Map([['0,0', { hex: new Hex(0, 0, 0), type: 'castle' }]]) },
        stats: { totalKills: 11, bestKills: 13, bestLevel: 2, warsFought: 8, lastOutcome: 'VICTORY' },
        imperialMandates: { serializeState: () => ({
            currentTick: 10,
            lastIssuedTick: 8,
            mandates: {
                levy_tithed_gold: {
                    status: 'ACTIVE',
                    deadlineTick: 18,
                    issuedTick: 11,
                    metadata: { requiredGold: 140 }
                }
            }
        }) }
    };
    Persistence.saveSnapshot(saveGame, 1);
    const loaded = Persistence.loadSnapshot(1, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    assert.ok(loaded.state);
    assert.strictEqual(loaded.state.gold, 77);
    assert.strictEqual(loaded.stats.totalKills, 11);
    assert.strictEqual(loaded.stats.bestKills, 13);
    assert.strictEqual(loaded.stats.bestLevel, 2);
    assert.strictEqual(loaded.stats.warsFought, 8);
    assert.strictEqual(loaded.stats.lastOutcome, 'VICTORY');
    assert.ok(loaded.stats.lastSaveISO, 'last save timestamp should be preserved');
    assert.strictEqual(loaded.state.imperialFavor, 9);
    assert.strictEqual(loaded.state.timekeeper.ticks, 8);
    assert.strictEqual(loaded.state.mandates.currentTick, 10);

    // Multi-slot isolation
    const altGame = { ...saveGame, gold: 999, imperialFavor: 12, stats: { totalKills: 42, bestLevel: 7, warsFought: 12 } };
    Persistence.saveSnapshot(altGame, 2);
    const slotOne = Persistence.loadSnapshot(1, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    const slotTwo = Persistence.loadSnapshot(2, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    assert.strictEqual(slotOne.state.gold, 77);
    assert.strictEqual(slotTwo.state.gold, 999);
    assert.strictEqual(slotTwo.stats.bestLevel, 7);
    assert.strictEqual(slotTwo.stats.warsFought, 12);
    assert.strictEqual(slotTwo.state.imperialFavor, 10, 'favor should clamp to 10 on persist/load');

    const meta = Persistence.getSlotMetadata(2);
    assert.ok(meta.hasSave);
    assert.strictEqual(meta.slot, '2');

    // Favor updates from gameplay systems should persist
    const favorShiftGame = { ...saveGame, imperialFavor: 2 };
    const favorSave = Persistence.saveSnapshot(favorShiftGame, 6);
    assert.strictEqual(favorSave.payload.imperialFavor, 2, 'saves should capture the latest imperial favor value');

    favorShiftGame.imperialFavor = 15;
    const clampedFavorSave = Persistence.saveSnapshot(favorShiftGame, 7);
    assert.strictEqual(clampedFavorSave.payload.imperialFavor, 10, 'favor persistence should honor clamp limits');

    // Persist scorched/rebel tiles and ensure they stay non-income when reloaded
    const penalizedGame = {
        gold: 0,
        wood: 0,
        difficulty: 0,
        upgrades: {},
        overworld: {
            hexes: new Map([
                ['0,0', { hex: new Hex(0, 0, 0), type: 'town', owner: 'rebel' }],
                ['1,0', { hex: new Hex(1, 0, -1), type: 'scorched', owner: 'scorched' }]
            ])
        },
        stats: {}
    };
    const savedPenalty = Persistence.saveSnapshot(penalizedGame, 5);
    assert.strictEqual(savedPenalty.payload.overworld.hexes.length, 2);

    const reloadedPenalty = Persistence.loadSnapshot(5, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    assert.ok(reloadedPenalty.state);
    assert.strictEqual(reloadedPenalty.state.overworld.hexes.size, 2);
    const scorchedTile = reloadedPenalty.state.overworld.hexes.get('1,0');
    assert.strictEqual(scorchedTile.type, 'scorched');
    assert.strictEqual(scorchedTile.owner, 'scorched');

    const rebelTile = reloadedPenalty.state.overworld.hexes.get('0,0');
    assert.strictEqual(rebelTile.owner, 'rebel');
    const income = calcIncome(reloadedPenalty.state.overworld.hexes);
    assert.deepStrictEqual(income, { gold: 0, wood: 0 });

    // Preserve exotic tiles and keep income lookups intact across save/load
    const exoticGame = {
        gold: 12,
        wood: 5,
        difficulty: 0,
        upgrades: {},
        overworld: {
            hexes: new Map([
                ['0,0', { hex: new Hex(0, 0, 0), type: 'mine' }],
                ['1,0', { hex: new Hex(1, 0, -1), type: 'shrine', owner: 'player' }],
                ['1,-1', { hex: new Hex(1, -1, 0), type: 'ruin' }]
            ])
        },
        stats: {},
        imperialFavor: 4
    };
    const exoticSave = Persistence.saveSnapshot(exoticGame, 9);
    assert.strictEqual(exoticSave.payload.overworld.hexes.length, 3, 'new tile ids should serialize');

    const exoticReload = Persistence.loadSnapshot(9, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    assert.ok(exoticReload.state);
    assert.strictEqual(exoticReload.state.overworld.hexes.size, 3);
    const exoticTypes = Array.from(exoticReload.state.overworld.hexes.values()).map(t => t.type).sort();
    assert.deepStrictEqual(exoticTypes, ['mine', 'ruin', 'shrine']);
    const exoticIncome = calcIncome(exoticReload.state.overworld.hexes);
    assert.deepStrictEqual(exoticIncome, { gold: 4, wood: 0 }, 'income should honor saved mine/ruin data');

    console.log('All persistence tests passed.');
}

runTests();
