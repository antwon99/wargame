import assert from 'assert';
import { buildCombatState, buildUltimatesState } from '../scripts/game/state.js';
import { DEFAULT_ULTIMATE_LEVELS, getUltimateChargeDelayMs } from '../scripts/game/ultimatesConfig.js';

function testCombatStateHasUltimatesContainer() {
    const combat = buildCombatState();
    assert.ok(combat.ultimates, 'Combat state should include an ultimates container');
    assert.ok(combat.ultimates.chargeMs, 'Ultimates should include chargeMs tracking');
    assert.ok(combat.ultimates.readyAtMs, 'Ultimates should include readyAtMs tracking');
    assert.ok(combat.ultimates.consumed, 'Ultimates should include consumed flags');
    assert.ok(combat.ultimates.activeEffects, 'Ultimates should include activeEffects bucket');
    assert.ok(combat.ultimates.levels, 'Ultimates should include per-ultimate levels');
    assert.ok(combat.ultimates.metadata, 'Ultimates should include per-ultimate metadata');
}

function testUltimatesStateSeedsChargeDelays() {
    const ultimates = buildUltimatesState();
    Object.keys(DEFAULT_ULTIMATE_LEVELS).forEach((ultimateId) => {
        const expected = getUltimateChargeDelayMs(ultimateId, DEFAULT_ULTIMATE_LEVELS[ultimateId]);
        assert.strictEqual(
            ultimates.readyAtMs[ultimateId],
            expected,
            `Ultimates should seed ${ultimateId} readyAtMs from config`
        );
    });
}

function testUltimatesStateRespectsLevelOverrides() {
    const ultimates = buildUltimatesState({ rush: 2 });
    const expected = getUltimateChargeDelayMs('rush', 2);
    assert.strictEqual(
        ultimates.readyAtMs.rush,
        expected,
        'Ultimates should respect level overrides for charge delay'
    );
}

function run() {
    testCombatStateHasUltimatesContainer();
    testUltimatesStateSeedsChargeDelays();
    testUltimatesStateRespectsLevelOverrides();
    console.log('Ultimate state factory tests passed.');
}

run();
