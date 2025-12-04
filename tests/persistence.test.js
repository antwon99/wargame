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
        rebel: {}
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
    const game = {
        gold: 100,
        wood: 50,
        difficulty: 2,
        imperialFavor: 7,
        upgrades: { soldier: 1 },
        overworld: {
            hexes: new Map([
                ['0,0', { hex: new Hex(0, 0, 0), type: 'castle' }],
                ['1,0', { hex: new Hex(1, 0, -1), type: 'field' }]
            ])
        },
        stats: { totalKills: 5 }
    };
    const snap = Persistence.serializeGameState(game);
    assert.strictEqual(snap.overworld.hexes.length, 2);
    assert.strictEqual(snap.stats.totalKills, 5);
    assert.strictEqual(snap.gold, 100);

    // Deserialize
    const snapshot = {
        gold: 12,
        wood: 7,
        difficulty: 1,
        upgrades: { soldier: 2 },
        imperialFavor: 3,
        overworld: { hexes: [{ q: 0, r: 0, s: 0, type: 'castle' }] },
        stats: { totalKills: 3 }
    };
    const result = Persistence.deserializeGameState(snapshot, {
        hexFactory: (q, r, s) => new Hex(q, r, s)
    });
    assert.strictEqual(result.overworld.hexes.size, 1);
    const only = Array.from(result.overworld.hexes.values())[0];
    assert.deepStrictEqual(only.hex.q, 0);
    assert.strictEqual(result.stats.totalKills, 3);
    assert.strictEqual(result.imperialFavor, 3);

    // Save/Load via mocked storage
    const saveGame = {
        gold: 77,
        wood: 9,
        difficulty: 4,
        upgrades: { soldier: 3 },
        imperialFavor: 9,
        overworld: { hexes: new Map([['0,0', { hex: new Hex(0, 0, 0), type: 'castle' }]]) },
        stats: { totalKills: 11, bestDifficulty: 2 }
    };
    Persistence.saveSnapshot(saveGame, 1);
    const loaded = Persistence.loadSnapshot(1, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    assert.ok(loaded.state);
    assert.strictEqual(loaded.state.gold, 77);
    assert.strictEqual(loaded.stats.totalKills, 11);
    assert.strictEqual(loaded.state.imperialFavor, 9);

    // Multi-slot isolation
    const altGame = { ...saveGame, gold: 999, imperialFavor: 12, stats: { totalKills: 42, bestDifficulty: 7 } };
    Persistence.saveSnapshot(altGame, 2);
    const slotOne = Persistence.loadSnapshot(1, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    const slotTwo = Persistence.loadSnapshot(2, { hexFactory: (q, r, s) => new Hex(q, r, s) });
    assert.strictEqual(slotOne.state.gold, 77);
    assert.strictEqual(slotTwo.state.gold, 999);
    assert.strictEqual(slotTwo.stats.bestDifficulty, 7);
    assert.strictEqual(slotTwo.state.imperialFavor, 10, 'favor should clamp to 10 on persist/load');

    const meta = Persistence.getSlotMetadata(2);
    assert.ok(meta.hasSave);
    assert.strictEqual(meta.slot, '2');

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

    console.log('All persistence tests passed.');
}

runTests();
