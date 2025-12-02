const assert = require('assert');
const {
    COMBAT_BUILDINGS,
    UNITS,
    getBuildingStats,
    getSpawnRate,
    getUnitStats
} = require('../scripts/combatEngine.js');

function testUnitStatsFallbackToBaseWhenUpgradeMissing() {
    const game = { upgrades: {} };

    const soldier = getUnitStats(game, 'soldier');
    assert.strictEqual(soldier.hp, UNITS.soldier.hp, 'Soldier HP should remain at base without upgrades');
    assert.strictEqual(soldier.dmg, UNITS.soldier.dmg, 'Soldier damage should remain at base without upgrades');

    const archer = getUnitStats({}, 'archer');
    assert.strictEqual(archer.hp, UNITS.archer.hp, 'Archer HP should remain at base when upgrades object is missing');
    assert.strictEqual(archer.dmg, UNITS.archer.dmg, 'Archer damage should remain at base when upgrades object is missing');
}

function testBuildingStatsFallbackWhenDefenseMissing() {
    const game = {}; // no upgrades present

    const castle = getBuildingStats(game, 'castle', 'player');
    assert.strictEqual(castle.hp, COMBAT_BUILDINGS.CASTLE.hp, 'Castle HP should match base without defense upgrade');
    assert.strictEqual(castle.dmg, COMBAT_BUILDINGS.CASTLE.dmg, 'Castle damage should match base without defense upgrade');
}

function testSpawnRateFallbackWhenProductionMissing() {
    const baseRate = 4.5;
    const game = { upgrades: {} };

    const adjustedRate = getSpawnRate(game, baseRate);
    assert.strictEqual(adjustedRate, baseRate, 'Production upgrade should default to level 1 when missing');
}

function run() {
    testUnitStatsFallbackToBaseWhenUpgradeMissing();
    testBuildingStatsFallbackWhenDefenseMissing();
    testSpawnRateFallbackWhenProductionMissing();
    console.log('Combat engine upgrade default tests passed.');
}

run();
