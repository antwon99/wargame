const assert = require('assert');
const Persistence = require('../scripts/persistence.js');
const { createCampaignStore } = require('../scripts/campaignStore.js');

function testNormalizesLegacyStats() {
    const slot = '2';
    const persistenceStub = {
        loadSnapshot: () => ({
            slot,
            state: null,
            stats: { bestDifficulty: 5, warsPlayed: 7 }
        }),
        StatHelpers: Persistence.StatHelpers
    };
    const store = createCampaignStore({ persistence: persistenceStub });
    const loaded = store.load(slot);

    assert.strictEqual(loaded.slot, slot, 'load should preserve slot metadata');
    assert.strictEqual(loaded.stats.bestLevel, 5, 'bestDifficulty should map to bestLevel');
    assert.strictEqual(loaded.stats.warsFought, 7, 'warsPlayed should map to warsFought');
    assert.strictEqual(loaded.stats.lastOutcome, 'N/A', 'defaults should be applied via normalization');
}

function testHydratesSnapshotsWithDeserializer() {
    const slot = '3';
    const persistenceStub = {
        loadSnapshot: () => ({
            slot,
            state: {
                imperialFavor: 99,
                timekeeper: { ticks: -4, daysPerWeek: 0, weeksPerMonth: 0 },
                overworld: { hexes: [{ q: 0, r: 0, s: 0, type: 'castle' }] },
                stats: { totalKills: 1 }
            },
            stats: { totalKills: 1 }
        }),
        deserializeGameState: (snapshot, opts) => Persistence.deserializeGameState(snapshot, opts),
        StatHelpers: Persistence.StatHelpers
    };
    const hexFactory = (q, r, s) => ({ q, r, s, toString: () => `${q},${r}` });
    const store = createCampaignStore({ persistence: persistenceStub });

    const loaded = store.load(slot, { hexFactory });

    assert.strictEqual(loaded.slot, slot, 'load should preserve slot metadata');
    assert.strictEqual(loaded.state.imperialFavor, 10, 'imperial favor should clamp before applySnapshot');
    assert.strictEqual(loaded.state.timekeeper.ticks, 0, 'timekeeper ticks should be normalized to a safe minimum');
    assert.strictEqual(loaded.state.timekeeper.daysPerWeek, 1, 'timekeeper daysPerWeek should be normalized');
    assert.strictEqual(loaded.state.timekeeper.weeksPerMonth, 1, 'timekeeper weeksPerMonth should be normalized');
    assert.ok(loaded.state.overworld.hexes instanceof Map, 'overworld data should hydrate into a Map');
    assert.strictEqual(loaded.state.overworld.hexes.get('0,0').type, 'castle', 'overworld tiles should be preserved');
    assert.strictEqual(loaded.stats.totalKills, 1, 'stats should still propagate alongside state');
}

testNormalizesLegacyStats();
testHydratesSnapshotsWithDeserializer();
console.log('Campaign store tests passed.');
