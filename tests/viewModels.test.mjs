import assert from 'assert';
import { buildUpgradeView } from '../scripts/models/upgradeViewModel.js';
import { buildResearchView } from '../scripts/models/researchViewModel.js';
import { buildClusterSummary } from '../scripts/models/tileInspectorModel.js';

function testUpgradeViewModel() {
    const game = {
        gold: 250,
        upgrades: { soldier: 2, archer: 1 },
        getUpgradeCost: (id) => (id === 'soldier' ? 150 : 300)
    };

    const view = buildUpgradeView(game);
    const soldier = view.find((u) => u.id === 'soldier');
    const archer = view.find((u) => u.id === 'archer');

    assert.strictEqual(soldier.buttonLabel.includes('Lv.3'), true, 'next level should be reflected in the label');
    assert.strictEqual(soldier.canAfford, true, 'soldier upgrade should be affordable with 250 gold');
    assert.strictEqual(archer.canAfford, false, 'archer upgrade should be unaffordable when cost exceeds gold');
}

function testResearchViewOptions() {
    const tech = {
        id: 'land-reclamation',
        name: 'Land Reclamation',
        description: 'Convert a field into something useful.',
        costOptions: [
            { id: 'forest', label: '500g: Plant Forest', cost: { gold: 500 } },
            { id: 'town', label: '800g: Raise Town', cost: { gold: 800 } }
        ],
        growthFactor: 1.35,
        maxPurchases: 3,
        timesPurchased: 1
    };
    const game = {
        research: { lives: 1, technologies: [tech] },
        hasFieldToConvert: () => true,
        getTech: (id) => (id === 'lives' ? { maxPurchases: 3 } : null),
        getTechCost: (target, optionId) => target.costOptions.find((opt) => opt.id === optionId)?.cost,
        formatCost: (cost) => `${cost.gold}g`,
        canPayCost: (cost) => cost.gold <= 600
    };

    const view = buildResearchView(game);
    const card = view.technologies[0];
    assert.ok(card.hasOptions, 'option-based tech should expose options');
    const forest = card.options.find((opt) => opt.id === 'forest');
    const town = card.options.find((opt) => opt.id === 'town');
    assert.ok(forest.affordable, 'cheaper option should be affordable');
    assert.ok(!town.affordable, 'expensive option should be unaffordable');
    assert.ok(card.scaleHint.includes('×1.35'), 'scale hint should reflect growth factor');
}

function testClusterSummary() {
    const cluster = { size: 3, woodBonus: 2, adjacencyRate: 0.2, reclamationRate: 0.05, totalRate: 0.25 };
    const tile = { type: 'forest', hex: { q: 0, r: 0, toString: () => '0,0' }, clusterBonus: cluster };
    const game = { paused: false, overworld: { clusterBonuses: new Map([['0,0', cluster]]) } };

    const summary = buildClusterSummary(game, tile, 'Forest');
    assert.ok(summary.payload.includes('+2w'), 'summary should include wood bonus');
    assert.ok(summary.label.includes('3-tile'), 'cluster size should appear in the label');
    assert.ok(summary.hasAdjacency, 'cluster bonuses should register as active');
    assert.ok(summary.detail.toLowerCase().includes('adjacency'), 'detail text should mention adjacency context');
}

testUpgradeViewModel();
testResearchViewOptions();
testClusterSummary();

console.log('View model helpers passed.');
