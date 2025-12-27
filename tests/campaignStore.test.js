const assert = require('assert');
const Persistence = require('../scripts/persistence.js');
Persistence.initPersistence?.(globalThis);
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

function testFallsBackToGlobalDeserializerWhenMissing() {
    const slot = '4';
    const persistenceStub = {
        loadSnapshot: () => ({
            slot,
            state: {
                overworld: {
                    hexes: [
                        { q: 0, r: 0, s: 0, type: 'CASTLE', owner: 'PLAYER' },
                        { q: 1, r: 0, s: -1, type: 'mystery' }
                    ]
                },
                stats: { totalKills: 2 }
            },
            stats: { totalKills: 2 }
        }),
        StatHelpers: Persistence.StatHelpers
    };
    const hexFactory = (q, r) => ({ q, r, toString: () => `hex-${q},${r}` });
    const store = createCampaignStore({ persistence: persistenceStub });

    const loaded = store.load(slot, { hexFactory });

    assert.ok(loaded.state.overworld.hexes instanceof Map, 'overworld hexes should hydrate through global deserializer');
    assert.ok(loaded.state.overworld.hexes.has('hex-0,0'), 'valid tiles should be preserved through hydration');
    assert.strictEqual(loaded.state.overworld.hexes.get('hex-0,0').owner, 'player', 'owners should normalize to lowercase');
    assert.strictEqual(loaded.state.overworld.hexes.has('hex-1,0'), false, 'unknown tile ids should be filtered out');
}

function testReturnsPendingNotificationsUnmodified() {
    const slot = '5';
    const pendingNotifications = [{ id: 'hello', title: 'world' }];
    const persistenceStub = {
        loadSnapshot: () => ({
            slot,
            state: null,
            stats: { ...Persistence.DEFAULT_STATS },
            pendingNotifications
        }),
        StatHelpers: Persistence.StatHelpers
    };
    const store = createCampaignStore({ persistence: persistenceStub });

    const loaded = store.load(slot);

    assert.strictEqual(loaded.pendingNotifications, pendingNotifications, 'load should pass through pendingNotifications without mutation');
}

function testLoadCampaignDelegatesSynchronously() {
    const slot = '6';
    const expected = { state: { foo: 'bar' }, stats: { totalKills: 42 }, slot };
    let loadCalled = false;
    const persistenceStub = {
        loadSnapshot: (slotArg, optionsArg) => {
            loadCalled = true;
            assert.strictEqual(slotArg, slot, 'slot should pass through to persistence');
            assert.deepStrictEqual(optionsArg, { hexFactory: 'noop' }, 'options should remain unchanged');
            return expected;
        },
        StatHelpers: Persistence.StatHelpers
    };

    const store = createCampaignStore({ persistence: persistenceStub });
    const loaded = store.loadCampaign(slot, { hexFactory: 'noop' });

    assert.ok(loadCalled, 'loadCampaign should synchronously call persistence.loadSnapshot');
    assert.strictEqual(loaded, expected, 'loadCampaign should return the persistence payload unmodified');
}

testNormalizesLegacyStats();
testHydratesSnapshotsWithDeserializer();
testFallsBackToGlobalDeserializerWhenMissing();
testReturnsPendingNotificationsUnmodified();
testLoadCampaignDelegatesSynchronously();
console.log('Campaign store tests passed.');
