const assert = require('assert');
const Juice = require('../scripts/juice.js');

function testBurstRange() {
    const vectors = Juice.createBurstVectors(8, 15, 35);
    assert.strictEqual(vectors.length, 8);
    vectors.forEach(v => {
        const mag = Math.hypot(v.dx, v.dy);
        assert.ok(mag >= 15 && mag <= 35, `vector magnitude ${mag} out of range`);
        assert.strictEqual(v.duration, 700);
    });
}

function testCountCap() {
    const vectors = Juice.createBurstVectors(999, 10, 20);
    assert.ok(vectors.length <= 24);
}

function testShakeClamp() {
    assert.strictEqual(Juice.clampShakeDuration(50), 100);
    assert.strictEqual(Juice.clampShakeDuration(650), 600);
    assert.strictEqual(Juice.clampShakeDuration(300), 300);
}

async function testEffectsModuleCameraShake() {
    const node = {
        classList: {
            added: [],
            removed: [],
            add(cls) { this.added.push(cls); },
            remove(cls) { this.removed.push(cls); }
        }
    };
    const originalDocument = global.document;
    const originalJuice = global.Juice;
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    let cleared = false;
    const durations = [];
    let clampedValue = null;

    global.document = { getElementById: () => node };
    global.Juice = {
        clampShakeDuration(value) {
            clampedValue = value;
            return 123;
        }
    };
    global.clearTimeout = () => { cleared = true; };
    global.setTimeout = (fn, duration) => { durations.push(duration); fn(); return 't'; };

    const { triggerCameraShake } = await import('../scripts/ui/effects.js');
    const game = {};
    triggerCameraShake(game);

    assert.strictEqual(clampedValue, 300, 'effects module should defer shake duration to Juice');
    assert.deepStrictEqual(durations, [123]);
    assert.ok(node.classList.added.includes('shake'));
    assert.ok(node.classList.removed.includes('shake'));
    assert.ok(cleared, 'existing timer should clear before scheduling new shake');

    global.document = originalDocument;
    if (originalJuice) global.Juice = originalJuice; else delete global.Juice;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
}

async function testEffectExportsFromBindings() {
    const bindings = await import('../scripts/uiBindings.js');
    const effects = await import('../scripts/ui/effects.js');
    assert.strictEqual(bindings.triggerCameraShake, effects.triggerCameraShake);
}

async function run() {
    testBurstRange();
    testCountCap();
    testShakeClamp();
    await testEffectsModuleCameraShake();
    await testEffectExportsFromBindings();
    console.log('All juice tests passed.');
}

run();
