const assert = require('assert');

global.localStorage = (() => {
    const store = new Map();
    return {
        getItem: key => store.get(key) || null,
        setItem: (key, value) => store.set(key, value),
        removeItem: key => store.delete(key),
        clear: () => store.clear(),
        key: index => Array.from(store.keys())[index] || null,
        get length() { return store.size; },
        keys: () => Array.from(store.keys())
    };
})();

global.Hex = class Hex {
    constructor(q, r, s) { this.q = q; this.r = r; this.s = s; }
    toString() { return `${this.q},${this.r}`; }
};

const Persistence = require('../scripts/persistence.js');

async function runTests() {
    const { createCampaignStore } = await import('../scripts/persistence/campaignStore.js');
    Persistence.setStorageAdapter(Persistence.createStorageAdapter(global.localStorage));
    global.localStorage.clear();

    const events = [];
    const hudEvents = [];
    const applied = [];
    const baseGame = {
        gold: 50,
        wood: 20,
        difficulty: 2,
        imperialFavor: 7,
        timekeeper: { ticks: 3, daysPerWeek: 6, weeksPerMonth: 4 },
        upgrades: { soldier: 2 },
        overworld: { hexes: new Map([['0,0', { hex: new Hex(0, 0, 0), type: 'castle' }]]) },
        stats: { totalKills: 3, bestDifficulty: 4 },
        getNotificationStack: () => ({ queue: [], visible: new Map() })
    };

    const store = createCampaignStore({
        snapshotter: () => baseGame,
        applier: (state, stats, slot) => applied.push({ state, stats, slot }),
        notifier: (event, payload) => events.push({ event, payload }),
        hudUpdater: (event, payload) => hudEvents.push({ event, payload }),
        settingsStorage: global.localStorage,
        hexFactory: (q, r, s) => new Hex(q, r, s),
        resetter: () => applied.push({ reset: true })
    });

    const saveResult = store.saveSlot('1');
    assert.ok(saveResult.ok, 'save operations should succeed when persistence is available');
    assert.strictEqual(saveResult.slot, '1');
    assert.strictEqual(events[0].event, 'save', 'notifier should receive save events');
    assert.strictEqual(hudEvents[0].event, 'save', 'HUD updater should mirror save events');

    const loadResult = store.loadSlot('1');
    assert.ok(loadResult.ok, 'load should hydrate existing snapshots');
    assert.strictEqual(applied[0].slot, '1', 'applier should receive slot identifier');
    assert.strictEqual(applied[0].state.gold, 50, 'applier should receive hydrated state payloads');
    assert.strictEqual(applied[0].stats.bestLevel, 4, 'hydrateStats should normalize legacy bestDifficulty');
    assert.ok(applied[0].state.overworld.hexes.get('0,0').hex instanceof Hex, 'hexFactory should reconstruct Hex instances');

    const missingLoad = store.loadSlot('9');
    assert.strictEqual(missingLoad.ok, false, 'missing slots should not report success');
    assert.strictEqual(events.find(e => e.event === 'load:missing')?.payload.slot, '9');

    const resetResult = store.resetCampaign();
    assert.ok(resetResult.ok, 'reset should always resolve even when persistence is optional');
    assert.deepStrictEqual(resetResult.slot, '1');
    assert.ok(applied.find(entry => entry.reset), 'resetter callback should fire during resets');
    assert.strictEqual(events.find(e => e.event === 'reset')?.payload.slot, '1');

    console.log('All campaign store tests passed.');
}

runTests().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
