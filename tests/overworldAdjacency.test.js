const assert = require('assert');

async function testMixedNeighborsStillCluster() {
    const { buildClusterBonusMap, DEFAULT_CLUSTER_RATE } = await import('../scripts/overworldAdjacency.js');

    const mkTile = (q, r, type, owner = 'player') => {
        const hex = { q, r, s: -q - r, toString: () => `${q},${r}` };
        return { hex, type, owner };
    };

    const hexes = new Map();
    hexes.set('0,0', mkTile(0, 0, 'forest'));
    hexes.set('1,0', mkTile(1, 0, 'forest'));
    hexes.set('1,-1', mkTile(1, -1, 'town'));

    const bonuses = buildClusterBonusMap(hexes, { baseRate: DEFAULT_CLUSTER_RATE });

    assert.strictEqual(bonuses.size, 3, 'all tiles should be evaluated even when types differ');

    const forestCluster = bonuses.get('0,0');
    assert.ok(forestCluster, 'forest tile should receive a cluster payload');
    assert.strictEqual(forestCluster.size, 2, 'forest tiles should cluster together');
    assert.strictEqual(
        forestCluster.adjacencyRate,
        DEFAULT_CLUSTER_RATE,
        'two-tile cluster should apply single base rate increment'
    );

    const townCluster = bonuses.get('1,-1');
    assert.ok(townCluster, 'non-matching neighbors should still be processed later');
    assert.strictEqual(townCluster.size, 1, 'isolated tile should report size one');
    assert.strictEqual(townCluster.adjacencyRate, 0, 'isolated tile should not receive adjacency bonus');

    console.log('Overworld adjacency mixed-neighbor test passed.');
}

async function run() {
    await testMixedNeighborsStillCluster();
    console.log('Overworld adjacency tests passed.');
}

run();
