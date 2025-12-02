const assert = require('assert');
const { computeWarEntryFee } = require('../scripts/combatEngine.js');

function testWarEntryIsFree() {
    const dummyGame = { difficulty: 0 };
    assert.strictEqual(computeWarEntryFee(dummyGame), 0, 'Wars should be free at base difficulty');

    dummyGame.difficulty = 9;
    assert.strictEqual(computeWarEntryFee(dummyGame), 0, 'Wars should remain free regardless of difficulty');
}

function run() {
    testWarEntryIsFree();
    console.log('All war entry fee tests passed.');
}

run();
