import assert from 'assert';
import { buildClusterBonusMap, normalizeOverworldHexKey } from '../scripts/overworldAdjacency.js';

async function run() {
    const key = normalizeOverworldHexKey({ hex: { q: 2, r: 3 } });
    assert.strictEqual(key, '2,3', 'Expected coordinates to normalize to q,r string');
    assert.strictEqual(normalizeOverworldHexKey({ hex: { q: 2 } }), null, 'Missing coordinates should yield null');

    const hexes = new Map([
        ['forest-a', { type: 'forest', owner: 'player', hex: { q: 0, r: 0 } }],
        ['forest-b', { type: 'forest', owner: 'player', hex: { q: 1, r: 0 } }],
        ['incomplete', { type: 'forest', owner: 'player', hex: { q: 2 } }]
    ]);

    const bonuses = buildClusterBonusMap(hexes, { baseRate: 0.5 });
    assert.strictEqual(bonuses.size, 2, 'Only tiles with valid coordinates should be mapped');
    assert.ok(bonuses.has('0,0'));
    assert.ok(bonuses.has('1,0'));
    assert.strictEqual(bonuses.has('2,0'), false, 'Incomplete coordinates should be skipped');

    const sampleBonus = bonuses.get('0,0');
    assert.strictEqual(sampleBonus?.size, 2, 'Cluster size should reflect contiguous neighbors');
    assert.strictEqual(sampleBonus?.woodBonus, 1, 'Adjacency rate should be applied to income');

    console.log('overworldAdjacency normalization tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
