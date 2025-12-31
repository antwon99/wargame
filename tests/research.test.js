import assert from 'assert';
import { ResearchSystem } from '../scripts/researchSystem.js';

ResearchSystem.initResearchSystem?.(globalThis);

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
    assert.strictEqual(forestCost.gold, 500, 'forest option should cost gold');
    assert.strictEqual(townCost.gold, 500, 'town option should cost gold');
}

function testLandReclamationRequiresOption() {
    const techs = ResearchSystem.instantiateTechnologies();
    const reclaim = techs.find(t => t.id === 'land-reclamation');
    assert.throws(() => ResearchSystem.getCostForTech(reclaim), /optionId is required/,
        'optioned tech should reject missing optionId');
}

function testInvalidOptionYieldsNullCost() {
    const techs = ResearchSystem.instantiateTechnologies();
    const reclaim = techs.find(t => t.id === 'land-reclamation');
    const invalidCost = ResearchSystem.getCostForTech(reclaim, 'invalid');
    assert.strictEqual(invalidCost, null, 'invalid option id should not return an empty cost object');
}

function testLandReclamationScalesCost() {
    const techs = ResearchSystem.instantiateTechnologies();
    const reclaim = techs.find(t => t.id === 'land-reclamation');
    const baseCost = ResearchSystem.getCostForTech(reclaim, 'forest');
    ResearchSystem.recordPurchase(reclaim);
    const nextCost = ResearchSystem.getCostForTech(reclaim, 'forest');
    assert.ok(nextCost.gold > baseCost.gold, 'subsequent reclamations should scale in gold cost');
}

function testAffordabilityHelper() {
    assert.ok(ResearchSystem.isAffordable({ gold: 600, wood: 0 }, { gold: 500 }));
    assert.ok(!ResearchSystem.isAffordable({ gold: 400 }, { gold: 500 }), 'should fail when under budget');
}

function testClampsSavedPurchasesToMax() {
    const techs = ResearchSystem.instantiateTechnologies([
        { id: 'lives', purchased: false, timesPurchased: 5 }
    ]);
    const lives = techs.find(t => t.id === 'lives');

    assert.strictEqual(lives.timesPurchased, lives.maxPurchases,
        'saved timesPurchased should clamp to documented maximum');
    assert.ok(lives.purchased, 'purchased flag should derive from clamped timesPurchased');
}

function run() {
    testInstantiatesWithSavedPurchases();
    testCostScalingForLives();
    testLandReclamationOptions();
    testLandReclamationRequiresOption();
    testInvalidOptionYieldsNullCost();
    testLandReclamationScalesCost();
    testAffordabilityHelper();
    testClampsSavedPurchasesToMax();
    console.log('All research tests passed.');
}

run();
