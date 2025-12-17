const assert = require('assert');

async function runTests() {
    const { createCampaignStore } = await import('../scripts/persistence/campaignStore.js');

    let savedPayload = null;
    let cleared = false;
    let warningMessage = null;
    let activeSlot = '1';
    let stats = { totalKills: 1, bestLevel: 0, bestKills: 0, warsFought: 0, lastOutcome: 'N/A' };
    let appliedState = null;
    let resetCalled = false;
    let hudRefreshes = 0;
    let leaderboardRefreshes = 0;
    let saveSlotsRefreshed = 0;
    const toasts = [];

    const persistence = {
        DEFAULT_STATS: {
            totalKills: 0,
            bestKills: 0,
            bestLevel: 0,
            warsFought: 0,
            lastOutcome: 'N/A',
            lastSaveISO: null
        },
        saveSnapshot: (snapshot, slot) => {
            savedPayload = { snapshot, slot: String(slot) };
            return { savedAt: '2024-01-01T00:00:00.000Z', payload: snapshot, slot: String(slot) };
        },
        loadSnapshot: (slot) => ({
            state: {
                gold: 5,
                wood: 3,
                difficulty: 1,
                upgrades: {},
                research: {},
                imperialFavor: 7,
                overworld: { hexes: [] },
                timekeeper: { ticks: 0 },
                stats: { lastSaveISO: 'yesterday' }
            },
            stats: { totalKills: 9, lastSaveISO: 'yesterday' },
            slot: String(slot)
        }),
        clearSnapshot: () => { cleared = true; }
    };

    const store = createCampaignStore({
        persistence,
        getSnapshot: () => ({
            gold: 10,
            wood: 5,
            difficulty: 2,
            upgrades: {},
            research: {},
            imperialFavor: 6,
            overworld: { hexes: [] },
            timekeeper: { ticks: 0 },
            stats
        }),
        applySnapshot: (state) => { appliedState = state; },
        getStats: () => stats,
        setStats: (next) => { stats = next; },
        getActiveSlot: () => activeSlot,
        setActiveSlot: (slot) => { activeSlot = slot; },
        resetWorld: () => { resetCalled = true; },
        onHUDRefresh: () => { hudRefreshes += 1; },
        onLeaderboardRefresh: () => { leaderboardRefreshes += 1; },
        onSaveSlotsUpdate: () => { saveSlotsRefreshed += 1; },
        onToast: (message, color) => { toasts.push({ message, color }); },
        onWarning: (message) => { warningMessage = message; }
    });

    const saveResult = store.save({ slot: 2 });
    assert.strictEqual(saveResult.slot, '2');
    assert.strictEqual(savedPayload.slot, '2');
    assert.strictEqual(activeSlot, '2');
    assert.strictEqual(toasts[0].message, 'Progress Saved', 'save should emit toast feedback');

    const loadResult = store.load({ slot: '2' });
    assert.strictEqual(loadResult.slot, '2');
    assert.ok(appliedState, 'load should apply snapshots');
    assert.strictEqual(stats.totalKills, 9, 'load should hydrate stats via setter');
    assert.ok(hudRefreshes > 0, 'load should refresh HUD when enabled');
    assert.ok(saveSlotsRefreshed > 0, 'load should refresh save slot UI when data exists');

    store.reset();
    assert.ok(cleared, 'reset should clear persistence');
    assert.ok(resetCalled, 'reset should rebuild the overworld');
    assert.strictEqual(activeSlot, '1', 'reset should return to slot 1');
    assert.deepStrictEqual(stats, persistence.DEFAULT_STATS, 'reset should hydrate default stats');
    assert.strictEqual(
        toasts.some(({ message }) => message === 'Progress Reset'),
        true,
        'reset should emit toast feedback'
    );

    const silentStore = createCampaignStore({
        persistence: null,
        getSnapshot: null,
        applySnapshot: () => {},
        onWarning: (message) => { warningMessage = message; }
    });
    const silentSave = silentStore.save();
    assert.strictEqual(silentSave, null, 'missing persistence should short-circuit saves');
    assert.ok(warningMessage, 'warning callback should surface persistence failures');

    console.log('All campaign store tests passed.');
}

runTests().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
