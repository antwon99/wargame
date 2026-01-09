import assert from 'assert';
import { createGameCore } from '../scripts/game/core.js';
import { DEFAULT_ULTIMATE_LEVELS, getUltimateMaxLevel, getUltimateUpgradeCost } from '../scripts/game/ultimatesConfig.js';

function testUltimateUpgradePurchases() {
    const { Game } = createGameCore({ dependencies: { persistence: null } });
    Game.spawnTxt = () => {};
    Game.updateHUD = () => {};
    Game.updateUltimatesUI = () => {};

    Game.gold = 1000;
    Game.ultimates = { ...DEFAULT_ULTIMATE_LEVELS };

    const rushCost = Game.getUltimateUpgradeCost('rush');
    assert.strictEqual(
        rushCost,
        getUltimateUpgradeCost('rush', DEFAULT_ULTIMATE_LEVELS.rush),
        'rush cost should match config scaling'
    );

    const buyResult = Game.buyUltimate('rush');
    assert.strictEqual(buyResult, true, 'buyUltimate should succeed when affordable');
    assert.strictEqual(Game.ultimates.rush, DEFAULT_ULTIMATE_LEVELS.rush + 1, 'rush level should increase');
    assert.strictEqual(Game.gold, 1000 - rushCost, 'gold should decrease by the upgrade cost');

    Game.ultimates.rush = getUltimateMaxLevel('rush');
    const maxedResult = Game.buyUltimate('rush');
    assert.strictEqual(maxedResult, false, 'buyUltimate should fail once maxed');
}

testUltimateUpgradePurchases();
console.log('Ultimate upgrade tests passed.');
