import assert from 'assert';
import {
    OVERWORLD_RESTORE_WEIGHTS,
    OVERWORLD_TERRAIN_WEIGHTS,
    rollWeightedTerrainType
} from '../scripts/overworldConfig.js';

function testFieldWeightTuned() {
    const fieldEntry = OVERWORLD_TERRAIN_WEIGHTS.find((entry) => entry.type === 'field');
    assert.ok(fieldEntry, 'field entry should exist in overworld terrain weights');
    assert.strictEqual(fieldEntry.weight, 45, 'field terrain weight should reflect the tuned distribution');
}

function testRollWeightedTerrainTypeUsesTable() {
    const weights = [
        { type: 'alpha', weight: 1 },
        { type: 'beta', weight: 3 }
    ];
    assert.strictEqual(
        rollWeightedTerrainType(weights, () => 0),
        'alpha',
        'rollWeightedTerrainType should select the first entry when rng is 0'
    );
    assert.strictEqual(
        rollWeightedTerrainType(weights, () => 0.75),
        'beta',
        'rollWeightedTerrainType should respect weights when rng falls in the second bucket'
    );
}

function testRestoreWeightsExcludeRebelCamps() {
    const hasRebelCamp = OVERWORLD_RESTORE_WEIGHTS.some((entry) => entry.type === 'rebelcamp');
    assert.strictEqual(hasRebelCamp, false, 'restore weights should omit rebel camps');
}

function run() {
    testFieldWeightTuned();
    testRollWeightedTerrainTypeUsesTable();
    testRestoreWeightsExcludeRebelCamps();
    console.log('Overworld config tests passed.');
}

run();
