import assert from 'assert';
import { createGameCore } from '../scripts/game/core.js';
import { buildCombatState, buildUltimatesState } from '../scripts/game/state.js';

function buildCombatGame(selectedUltimate = 'rush') {
    const { Game } = createGameCore({ dependencies: { persistence: null } });
    Game.state = 'COMBAT';
    Game.combat = buildCombatState();
    Game.combat.warElapsedMs = 20000;
    Game.combat.ultimates = buildUltimatesState(Game.ultimates, selectedUltimate);
    return Game;
}

function testActivateUltimateWhenCharged() {
    const game = buildCombatGame('rush');
    game.combat.ultimates.chargeMs.rush = game.combat.ultimates.readyAtMs.rush;
    const activated = game.activateUltimate('rush');

    assert.strictEqual(activated, true, 'activateUltimate should succeed once charged');
    assert.ok(game.combat.ultimates.activeEffects.rush, 'rush should be marked active');
    assert.strictEqual(game.combat.ultimates.consumed.rush, false, 'rush should not be consumed immediately');
    assert.strictEqual(
        game.combat.ultimates.metadata.rush.activatedAtMs,
        game.combat.warElapsedMs,
        'rush activation time should be recorded'
    );
}

function testActivateUltimateFailsWhenUncharged() {
    const game = buildCombatGame('rush');
    game.combat.ultimates.chargeMs.rush = 0;
    const activated = game.activateUltimate('rush');

    assert.strictEqual(activated, false, 'activateUltimate should fail when not charged');
    assert.ok(!game.combat.ultimates.activeEffects.rush, 'uncharged ultimate should remain inactive');
}

testActivateUltimateWhenCharged();
testActivateUltimateFailsWhenUncharged();
console.log('Ultimate activation tests passed.');
