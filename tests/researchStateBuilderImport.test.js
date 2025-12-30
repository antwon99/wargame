const assert = require('assert');

function run() {
    const { createGameCore } = require('../scripts/game/core.js');
    const { Game } = createGameCore({ dependencies: { persistence: null } });
    const researchState = Game.buildResearchState();

    assert.ok(Array.isArray(researchState.technologies), 'Research technologies should be an array.');
    assert.ok(researchState.bonuses && typeof researchState.bonuses === 'object', 'Research bonuses should be an object.');
    assert.strictEqual(typeof researchState.lives, 'number', 'Research lives should be numeric.');

    const negativeLivesState = Game.buildResearchState({
        technologies: [{ id: 'lives', timesPurchased: 1 }],
        lives: -3
    });
    assert.strictEqual(negativeLivesState.lives, 0, 'Research lives should clamp at zero.');
}

run();
console.log('Research state builder import test passed.');
