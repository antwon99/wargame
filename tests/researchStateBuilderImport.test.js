const assert = require('assert');

function run() {
    const { createGameCore } = require('../scripts/game/core.js');
    const { Game } = createGameCore({ persistence: null });
    const researchState = Game.buildResearchState();

    assert.ok(Array.isArray(researchState.technologies), 'Research technologies should be an array.');
    assert.ok(researchState.bonuses && typeof researchState.bonuses === 'object', 'Research bonuses should be an object.');
    assert.strictEqual(typeof researchState.lives, 'number', 'Research lives should be numeric.');
}

run();
console.log('Research state builder import test passed.');
