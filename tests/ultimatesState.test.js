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

function testUltimatesStateRespectsSelection() {
    const ultimates = buildUltimatesState({}, 'manpower');
    assert.strictEqual(
        ultimates.selectedId,
        'manpower',
        'Ultimates should store the selected ultimate id'
    );
    assert.strictEqual(
        ultimates.consumed.manpower,
        false,
        'Selected ultimate should be available at the start of combat'
    );
    assert.strictEqual(
        ultimates.consumed.rush,
        true,
        'Non-selected ultimates should be unavailable at battle start'
    );
    assert.strictEqual(
        ultimates.consumed.gold,
        true,
        'Non-selected ultimates should be unavailable at battle start'
    );
}

function run() {
    testCombatStateHasUltimatesContainer();
    testUltimatesStateSeedsChargeDelays();
    testUltimatesStateRespectsLevelOverrides();
    testUltimatesStateRespectsSelection();
    console.log('Ultimate state factory tests passed.');
}

run();
