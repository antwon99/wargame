import assert from 'assert';
import { Timekeeper } from '../scripts/timekeeper.js';
import { createNarrativeSystem } from '../scripts/narrative/narrativeSystem.js';

function createNotificationManager() {
    return {
        items: [],
        enqueue(payload) {
            this.items.push(payload);
            return payload.id || null;
        }
    };
}

async function testDeterministicSelection() {
    const timekeeper = new Timekeeper({ startTick: 0 });
    timekeeper.reset(5);
    const notificationsA = createNotificationManager();
    const notificationsB = createNotificationManager();

    const systemA = createNarrativeSystem({ timekeeper, notificationManager: notificationsA });
    const systemB = createNarrativeSystem({ timekeeper, notificationManager: notificationsB });

    const payload = { severity: 'low', seed: 42, goldDelta: 5, woodDelta: 2 };
    const first = systemA.emit('economy', payload);
    const second = systemB.emit('economy', payload);

    assert.ok(first, 'first narrative beat should emit');
    assert.ok(second, 'second narrative beat should emit');
    assert.deepStrictEqual(first.lines, second.lines, 'seeded selections should match');
}

async function testCooldownGating() {
    const timekeeper = new Timekeeper({ startTick: 0 });
    const notifications = createNotificationManager();
    const system = createNarrativeSystem({ timekeeper, notificationManager: notifications });

    const first = system.emit('favor', { severity: 'low', favor: 4 });
    const second = system.emit('favor', { severity: 'low', favor: 4 });

    assert.ok(first, 'first low-severity beat should emit');
    assert.strictEqual(second, null, 'second low-severity beat in same week should gate');

    timekeeper.advance(timekeeper.daysPerWeek);
    const third = system.emit('favor', { severity: 'low', favor: 4 });
    assert.ok(third, 'new week should allow another low-severity beat');

    const highOne = system.emit('rebel', { severity: 'high', count: 3 });
    const highTwo = system.emit('rebel', { severity: 'high', count: 3 });
    const highThree = system.emit('rebel', { severity: 'high', count: 3 });

    assert.ok(highOne && highTwo, 'high severity should allow two beats in a week');
    assert.strictEqual(highThree, null, 'third high severity beat should gate');
}

async function testTemplateReplacementAndHydration() {
    const timekeeper = new Timekeeper({ startTick: 0 });
    timekeeper.reset(0);
    const notifications = createNotificationManager();
    const system = createNarrativeSystem({ timekeeper, notificationManager: notifications });

    const payload = { severity: 'low', favor: 6 };
    const result = system.emit('favor', payload);
    assert.ok(result, 'favor beat should emit');
    assert.ok(!result.lines.some((line) => /\{\w+\}/.test(line)), 'tokens should be replaced');

    const snapshot = system.serializeState();
    const notificationsB = createNotificationManager();
    const hydrated = createNarrativeSystem({ timekeeper, notificationManager: notificationsB });
    hydrated.hydrateState(snapshot);

    const gated = hydrated.emit('favor', payload);
    assert.strictEqual(gated, null, 'hydrated cooldowns should still gate repeated beats');
}

async function run() {
    await testDeterministicSelection();
    await testCooldownGating();
    await testTemplateReplacementAndHydration();
    console.log('Narrative system tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
