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

function createSeededRng(seed) {
    let state = seed >>> 0;
    return {
        next: () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 0x100000000;
        }
    };
}

async function testDeterministicSelection() {
    const timekeeper = new Timekeeper({ startTick: 0 });
    timekeeper.reset(0);
    const notifications = createNotificationManager();
    const rng = createSeededRng(123);
    const system = createNarrativeSystem({ timekeeper, notificationManager: notifications, rng });

    const payload = { severity: 'low', goldDelta: 5, woodDelta: 2, maxBeatsPerWeek: 2 };
    const first = system.emit('economy', payload);
    const second = system.emit('economy', payload);

    assert.ok(first, 'first narrative beat should emit');
    assert.ok(second, 'second narrative beat should emit');
    assert.strictEqual(
        first.lines[0],
        'Ledger update for Jan, week 1: treasury shift 5g, lumber shift 2w.',
        'seeded RNG should select the expected economy template'
    );
    assert.deepStrictEqual(first.lines, second.lines, 'seeded selection should repeat deterministically');
}

async function testCooldownGating() {
    const timekeeper = new Timekeeper({ startTick: 0 });
    timekeeper.reset(0);
    const notifications = createNotificationManager();
    const system = createNarrativeSystem({ timekeeper, notificationManager: notifications });

    system.emit('favor', { severity: 'low', voice: 'imperialClerk', favor: 4 });
    system.emit('favor', { severity: 'low', voice: 'imperialClerk', favor: 4 });

    const favorBeats = notifications.items.filter((item) => item.category === 'favor');
    assert.strictEqual(favorBeats.length, 1, 'low-severity beats should gate after one per voice/category');

    system.emit('rebel', { severity: 'high', voice: 'imperialClerk', count: 3 });
    system.emit('rebel', { severity: 'high', voice: 'imperialClerk', count: 3 });
    system.emit('rebel', { severity: 'high', voice: 'imperialClerk', count: 3 });

    const rebelBeats = notifications.items.filter((item) => item.category === 'rebel');
    assert.strictEqual(rebelBeats.length, 2, 'high-severity beats should allow two per voice/category');
}

async function testTemplateTokenFilling() {
    const timekeeper = new Timekeeper({ startTick: 0 });
    timekeeper.reset(0);
    const notifications = createNotificationManager();
    const system = createNarrativeSystem({ timekeeper, notificationManager: notifications });

    const economy = system.emit('economy', {
        severity: 'low',
        voice: 'imperialClerk',
        goldDelta: 12,
        woodDelta: -3
    });
    assert.ok(economy, 'economy beat should emit');
    assert.strictEqual(
        economy.lines[0],
        'Ledger update for Jan, week 1: treasury shift 12g, lumber shift -3w.',
        'economy template tokens should render deterministically'
    );

    const favor = system.emit('favor', { severity: 'low', voice: 'imperialClerk', favor: 9 });
    assert.ok(favor, 'favor beat should emit');
    assert.strictEqual(
        favor.lines[0],
        'Favor ledger stands at 9 as Jan week 1 closes.',
        'favor template tokens should render deterministically'
    );
}

async function run() {
    await testDeterministicSelection();
    await testCooldownGating();
    await testTemplateTokenFilling();
    console.log('Narrative system tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
