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

function run() {
    testBurstRange();
    testCountCap();
    testShakeClamp();
    console.log('All juice tests passed.');
}

run();
