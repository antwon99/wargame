const assert = require('assert');

function createStubElement(id) {
    return {
        id,
        innerText: '',
        title: '',
        style: {},
        classList: {
            classes: new Set(),
            add(cls) { this.classes.add(cls); },
            remove(cls) { this.classes.delete(cls); },
            toggle(cls, state) {
                const shouldAdd = state === undefined ? !this.classes.has(cls) : Boolean(state);
                if (shouldAdd) this.classes.add(cls); else this.classes.delete(cls);
            },
            contains(cls) { return this.classes.has(cls); }
        },
        setAttribute() {}
    };
}

function createDocument(ids = []) {
    const elements = new Map();
    const doc = {
        getElementById: (id) => elements.get(id) || null,
        register: (id) => {
            const el = createStubElement(id);
            elements.set(id, el);
            return el;
        }
    };
    ids.forEach((id) => doc.register(id));
    return doc;
}

async function testClusterBonusRenders() {
    const doc = createDocument([
        'tile-inspector',
        'tile-inspector-label',
        'tile-inspector-bonus',
        'tile-inspector-adjacency',
        'tile-inspector-adjacency-summary',
        'tile-inspector-adjacency-detail'
    ]);
    global.document = doc;
    const { updateTileInspector } = await import('../scripts/uiBindings.js');

    const key = '0,0';
    const cluster = { size: 3, goldBonus: 0, woodBonus: 2, adjacencyRate: 0.2, reclamationRate: 0.05 };
    const tile = { type: 'forest', owner: 'player', hex: { q: 0, r: 0, toString: () => key }, clusterBonus: cluster };
    const game = { state: 'OVERWORLD', paused: false, overworld: { clusterBonuses: new Map([[key, cluster]]) }, updateTileAttackOverlay: () => {} };

    updateTileInspector(game, tile);

    const bonusEl = doc.getElementById('tile-inspector-bonus');
    assert.ok(bonusEl.innerText.includes('+2w'), 'cluster line should include bonus income');
    assert.ok(bonusEl.innerText.includes('3-tile'), 'cluster size should be surfaced in the inspector');
    assert.ok(bonusEl.title.includes('Adjacency'), 'cluster tooltip should explain the rate applied');

    const adjacencySummary = doc.getElementById('tile-inspector-adjacency-summary');
    assert.ok(
        adjacencySummary.innerText.toLowerCase().includes('cluster bonuses'),
        'adjacency summary should highlight active bonuses'
    );
}

async function testPauseStatusUpdatesInspector() {
    const doc = createDocument([
        'tile-inspector',
        'tile-inspector-label',
        'tile-inspector-bonus',
        'tile-inspector-adjacency',
        'tile-inspector-adjacency-summary',
        'tile-inspector-adjacency-detail'
    ]);
    global.document = doc;
    const { updateTileInspector } = await import('../scripts/uiBindings.js');

    const key = '1,0';
    const cluster = { size: 2, goldBonus: 1, woodBonus: 0, adjacencyRate: 0.1, reclamationRate: 0 };
    const tile = { type: 'town', owner: 'player', hex: { q: 1, r: 0, toString: () => key }, clusterBonus: cluster };
    const game = { state: 'OVERWORLD', paused: true, overworld: { clusterBonuses: new Map([[key, cluster]]) }, updateTileAttackOverlay: () => {} };

    updateTileInspector(game, tile);
    const pausedText = doc.getElementById('tile-inspector-bonus').innerText;
    assert.ok(pausedText.toLowerCase().includes('paused'), 'paused HUD should warn that bonuses are frozen');

    game.paused = false;
    updateTileInspector(game, tile);
    const liveText = doc.getElementById('tile-inspector-bonus').innerText;
    assert.ok(!liveText.toLowerCase().includes('paused'), 'resuming should clear the paused status message');

    const adjacencyDetail = doc.getElementById('tile-inspector-adjacency-detail');
    assert.ok(
        adjacencyDetail.innerText.toLowerCase().includes('cluster'),
        'adjacency detail should remain visible when live'
    );
}

async function testZeroBonusClustersStillCountAsAdjacency() {
    const doc = createDocument([
        'tile-inspector',
        'tile-inspector-label',
        'tile-inspector-bonus',
        'tile-inspector-adjacency',
        'tile-inspector-adjacency-summary',
        'tile-inspector-adjacency-detail'
    ]);
    global.document = doc;
    const { updateTileInspector } = await import('../scripts/uiBindings.js');

    const key = '2,0';
    const cluster = { size: 2, goldBonus: 0, woodBonus: 0, adjacencyRate: 0, reclamationRate: 0, totalRate: 0 };
    const tile = { type: 'town', owner: 'player', hex: { q: 2, r: 0, toString: () => key }, clusterBonus: cluster };
    const game = { state: 'OVERWORLD', paused: false, overworld: { clusterBonuses: new Map([[key, cluster]]) }, updateTileAttackOverlay: () => {} };

    updateTileInspector(game, tile);

    const bonusEl = doc.getElementById('tile-inspector-bonus');
    assert.ok(bonusEl.innerText.includes('2-tile'), 'cluster label should surface adjacency even without income');
    assert.ok(!bonusEl.innerText.toLowerCase().includes('no adjacency'), 'clustered tiles should not be treated as isolated');
    assert.ok(bonusEl.title.toLowerCase().includes('cluster size'), 'tooltip should reflect clustered status when bonuses are zero');

    const adjacencyDetail = doc.getElementById('tile-inspector-adjacency-detail');
    assert.ok(adjacencyDetail.innerText.toLowerCase().includes('cluster'), 'adjacency detail should remain visible for clustered tiles');
}

async function testIsolatedTilesShowNoAdjacency() {
    const doc = createDocument([
        'tile-inspector',
        'tile-inspector-label',
        'tile-inspector-bonus',
        'tile-inspector-adjacency',
        'tile-inspector-adjacency-summary',
        'tile-inspector-adjacency-detail'
    ]);
    global.document = doc;
    const { updateTileInspector } = await import('../scripts/uiBindings.js');

    const key = '3,0';
    const cluster = { size: 1, goldBonus: 0, woodBonus: 0, adjacencyRate: 0, reclamationRate: 0, totalRate: 0 };
    const tile = { type: 'field', owner: 'player', hex: { q: 3, r: 0, toString: () => key }, clusterBonus: cluster };
    const game = { state: 'OVERWORLD', paused: false, overworld: { clusterBonuses: new Map([[key, cluster]]) }, updateTileAttackOverlay: () => {} };

    updateTileInspector(game, tile);

    const bonusEl = doc.getElementById('tile-inspector-bonus');
    assert.ok(bonusEl.innerText.includes('No adjacency'), 'isolated tiles should surface lack of adjacency');
    assert.ok(bonusEl.title.toLowerCase().includes('no adjacency'), 'isolated tiles should not claim clustered hover text');

    const adjacencySummary = doc.getElementById('tile-inspector-adjacency-summary');
    assert.ok(adjacencySummary.innerText.toLowerCase().includes('no adjacency'), 'summary should explain when no cluster bonuses apply');
}

async function testInspectorHidesOutsideOverworld() {
    const doc = createDocument([
        'tile-inspector',
        'tile-inspector-label',
        'tile-inspector-bonus',
        'tile-inspector-adjacency',
        'tile-inspector-adjacency-summary',
        'tile-inspector-adjacency-detail'
    ]);
    global.document = doc;
    const { updateTileInspector } = await import('../scripts/uiBindings.js');

    const overlayCalls = [];
    const tile = { type: 'forest', owner: 'enemy', hex: { q: 0, r: 1, toString: () => '0,1' } };
    const game = {
        state: 'COMBAT',
        paused: false,
        overworld: { clusterBonuses: new Map() },
        updateTileAttackOverlay: (arg) => overlayCalls.push(arg)
    };

    updateTileInspector(game, tile);
    const panel = doc.getElementById('tile-inspector');
    const bonus = doc.getElementById('tile-inspector-bonus');
    const adjacency = doc.getElementById('tile-inspector-adjacency');

    assert.ok(panel.classList.contains('hidden'), 'tile inspector should hide outside overworld state');
    assert.strictEqual(bonus.innerText, '');
    assert.strictEqual(bonus.title, '');
    assert.strictEqual(adjacency.style.display, 'none', 'adjacency details should hide when inspector is hidden');
    assert.deepStrictEqual(overlayCalls, [null], 'attack overlay should clear when inspector hides');
}

async function testClaimablePreviewShowsCost() {
    const doc = createDocument([
        'tile-inspector',
        'tile-inspector-label',
        'tile-inspector-bonus',
        'tile-inspector-adjacency',
        'tile-inspector-adjacency-summary',
        'tile-inspector-adjacency-detail'
    ]);
    global.document = doc;
    const { updateTileInspector } = await import('../scripts/uiBindings.js');

    const tile = { claimCost: 20, hex: { q: 0, r: 0, toString: () => '0,0' }, owner: 'neutral' };
    const game = {
        state: 'OVERWORLD',
        paused: false,
        wood: 15,
        overworld: { clusterBonuses: new Map() },
        updateTileAttackOverlay: () => {}
    };

    updateTileInspector(game, tile);

    const labelEl = doc.getElementById('tile-inspector-label');
    const bonusEl = doc.getElementById('tile-inspector-bonus');
    const panel = doc.getElementById('tile-inspector');
    const adjacency = doc.getElementById('tile-inspector-adjacency');

    assert.strictEqual(labelEl.innerText, 'UNCLAIMED FRONTIER');
    assert.ok(bonusEl.innerText.includes('20w'), 'claim preview should include wood cost');
    assert.ok(bonusEl.innerText.includes('5 more wood'), 'claim preview should surface affordability delta');
    assert.ok(!panel.classList.contains('hostile'), 'claimable previews should not mark the panel hostile');
    assert.strictEqual(adjacency.style.display, 'none', 'adjacency details should hide for unclaimed tiles');
}

async function testReclamationHintsReflectAvailability() {
    const doc = createDocument([
        'tile-inspector',
        'tile-inspector-label',
        'tile-inspector-bonus',
        'tile-inspector-adjacency',
        'tile-inspector-adjacency-summary',
        'tile-inspector-adjacency-detail'
    ]);
    global.document = doc;
    const { updateTileInspector } = await import('../scripts/uiBindings.js');

    const game = {
        state: 'OVERWORLD',
        paused: false,
        awaitingReclamationTarget: true,
        pendingReclamations: [{}],
        nextQueuedReclamationType: () => 'forest',
        hasFieldToConvert: () => false,
        overworld: { clusterBonuses: new Map() },
        updateTileAttackOverlay: () => {}
    };

    updateTileInspector(game, null);
    const bonus = doc.getElementById('tile-inspector-bonus');
    const adjacencyDetail = doc.getElementById('tile-inspector-adjacency-detail');

    assert.ok(
        bonus.innerText.toLowerCase().includes('no player fields'),
        'awaiting state should explain when no fields are available'
    );
    assert.ok(
        adjacencyDetail.innerText.toLowerCase().includes('secure more territory'),
        'inspector should guide players to claim more land when fields are gone'
    );

    const hostileTile = { type: 'forest', owner: 'enemy', hex: { q: 0, r: 0, toString: () => '0,0' } };
    game.hasFieldToConvert = () => true;

    updateTileInspector(game, hostileTile);
    assert.ok(
        bonus.innerText.toLowerCase().includes('enemy tile'),
        'enemy tiles should surface a dedicated reclamation warning'
    );
}

async function run() {
    await testClusterBonusRenders();
    await testPauseStatusUpdatesInspector();
    await testZeroBonusClustersStillCountAsAdjacency();
    await testIsolatedTilesShowNoAdjacency();
    await testInspectorHidesOutsideOverworld();
    await testClaimablePreviewShowsCost();
    await testReclamationHintsReflectAvailability();
    delete global.document;
    console.log('Tile inspector HUD tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
