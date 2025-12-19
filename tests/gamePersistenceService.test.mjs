import assert from 'assert';
import { createPersistenceService } from '../scripts/game/persistence.js';

function testFallbackLoadAndReset() {
    const fallbackStats = { bestLevel: 0, bestKills: 0, totalKills: 0, warsFought: 0, lastOutcome: 'N/A', lastSaveISO: null };
    const service = createPersistenceService({ persistence: null, fallbackStats });

    assert.strictEqual(service.isAvailable(), false, 'Service should report unavailable without a persistence adapter');

    const loaded = service.loadSnapshot('3');
    assert.strictEqual(loaded.slot, '3', 'loadSnapshot should echo the requested slot');
    assert.strictEqual(loaded.state, null, 'loadSnapshot should provide null state when unavailable');
    assert.deepStrictEqual(loaded.stats, fallbackStats, 'loadSnapshot should hydrate fallback stats');

    const reset = service.resetSnapshots();
    assert.strictEqual(reset.slot, '1', 'resetSnapshots should reset to slot 1 by default');
    assert.deepStrictEqual(reset.stats, fallbackStats, 'resetSnapshots should provide fallback stats when persistence is missing');
}

function testAdapterWiringAndNotificationReplay() {
    const calls = { loadSlot: null, saveSlot: null, cleared: false, replayed: 0 };
    const persistence = {
        DEFAULT_STATS: { bestLevel: 2, bestKills: 3, totalKills: 4, warsFought: 5, lastOutcome: 'N/A', lastSaveISO: null },
        loadSnapshot(slot, { hexFactory }) {
            calls.loadSlot = slot;
            return { state: { hexFactory }, stats: { ...this.DEFAULT_STATS }, slot };
        },
        saveSnapshot(game, slot) {
            calls.saveSlot = slot;
            return { savedAt: 'now', slot, payload: game };
        },
        clearSnapshot() {
            calls.cleared = true;
        }
    };

    const hexFactory = (q, r, s) => ({ q, r, s, tag: 'hex' });
    const service = createPersistenceService({ persistence, hexFactory });

    assert.ok(service.isAvailable(), 'Service should be available when adapter exists');
    assert.deepStrictEqual(service.getDefaultStats(), persistence.DEFAULT_STATS, 'Defaults should mirror adapter stats');

    const loadResult = service.loadSnapshot('2');
    assert.strictEqual(calls.loadSlot, '2', 'loadSnapshot should pass through slot argument');
    assert.deepStrictEqual(loadResult.state.hexFactory(1, 2, 3), { q: 1, r: 2, s: 3, tag: 'hex' }, 'Hex factory should be wrapped through loadSnapshot');

    const saveResult = service.saveSnapshot({ foo: 'bar' }, '2');
    assert.strictEqual(calls.saveSlot, '2', 'saveSnapshot should pass slot to persistence');
    assert.strictEqual(saveResult.slot, '2', 'saveSnapshot should return persistence payload');

    const resetResult = service.resetSnapshots();
    assert.ok(calls.cleared, 'resetSnapshots should call adapter clearSnapshot');
    assert.deepStrictEqual(resetResult.stats, persistence.DEFAULT_STATS, 'resetSnapshots should surface adapter defaults');

    const game = {
        pendingNotifications: [{ id: 'hello' }, { id: 'world' }],
        enqueueNotification(note) {
            calls.replayed += note ? 1 : 0;
        }
    };
    service.replayNotifications(game);
    assert.strictEqual(calls.replayed, 2, 'replayNotifications should enqueue pending notifications');
    assert.deepStrictEqual(game.pendingNotifications, [], 'replayNotifications should clear the backlog');
}

function run() {
    testFallbackLoadAndReset();
    testAdapterWiringAndNotificationReplay();
    console.log('All game persistence service tests passed.');
}

run();
