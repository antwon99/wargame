const assert = require('assert');
const VoidEasterEgg = require('../scripts/voidEasterEgg.js');

function testBaseMessages() {
    for (let i = 1; i <= 5; i++) {
        const result = VoidEasterEgg.computeMessage(i, () => 0.25);
        assert.strictEqual(result.message, 'Out of Bounds');
        assert.strictEqual(result.isSassy, false);
    }
}

function testSassyEverySixth() {
    const result = VoidEasterEgg.computeMessage(6, () => 0.5);
    assert.ok(VoidEasterEgg.SASSY_MESSAGES.includes(result.message), 'expected a sassy quip on the 6th click');
    assert.strictEqual(result.isSassy, true);
}

function testRandomIndexWraps() {
    const result = VoidEasterEgg.computeMessage(12, () => 1.9); // Force index beyond pool size
    assert.ok(VoidEasterEgg.SASSY_MESSAGES.includes(result.message), 'expected wrapped sassy quip');
}

function run() {
    testBaseMessages();
    testSassyEverySixth();
    testRandomIndexWraps();
    console.log('All void easter egg tests passed.');
}

run();
