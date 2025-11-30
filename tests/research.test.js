const assert = require('assert');
const ResearchSystem = require('../researchSystem.js');

function testInstantiatesWithSavedPurchases() {
    const techs = ResearchSystem.instantiateTechnologies([
        { id: 'lives', purchased: true, timesPurchased: 2 },
        { id: 'lumberjacks', purchased: true, timesPurchased: 1 }
    ]);

    const lives = techs.find(t => t.id === 'lives');
    const lumberjacks = techs.find(t => t.id === 'lumberjacks');

    assert.strictEqual(lives.timesPurchased, 2, 'lives purchase history should hydrate');
    assert.ok(lumberjacks.purchased, 'purchased flag should hydrate');
}

function testCostScalingForLives() {
    const [lives] = ResearchSystem.instantiateTechnologies().filter(t => t.id === 'lives');
    const baseCost = ResearchSystem.getCostForTech(lives);
    ResearchSystem.recordPurchase(lives);
    const nextCost = ResearchSystem.getCostForTech(lives);
    assert.strictEqual(baseCost.gold, 1000, 'base cost should match design');
    assert.ok(nextCost.gold > baseCost.gold * 2, 'scaled cost should grow aggressively');
}

function testLandReclamationOptions() {
    const techs = ResearchSystem.instantiateTechnologies();
    const reclaim = techs.find(t => t.id === 'land-reclamation');
    const forestCost = ResearchSystem.getCostForTech(reclaim, 'forest');
    const townCost = ResearchSystem.getCostForTech(reclaim, 'town');
    assert.strictEqual(forestCost.wood, 500, 'forest option should cost wood');
    assert.strictEqual(townCost.gold, 500, 'town option should cost gold');
}

function testAffordabilityHelper() {
    assert.ok(ResearchSystem.isAffordable({ gold: 600, wood: 0 }, { gold: 500 }));
    assert.ok(!ResearchSystem.isAffordable({ gold: 400 }, { gold: 500 }), 'should fail when under budget');
}

function run() {
    testInstantiatesWithSavedPurchases();
    testCostScalingForLives();
    testLandReclamationOptions();
    testAffordabilityHelper();
    console.log('All research tests passed.');
}

run();
