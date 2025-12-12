const assert = require('assert');

async function run() {
    const { resolveFogTileMask, buildTileVisibilityMap, TILE_VISIBILITY } = await import('../scripts/fogMask.js');

    const directMask = resolveFogTileMask({ tileMask: new Set(['0,0']) });
    assert.ok(directMask, 'direct mask should return a payload');
    assert.strictEqual(directMask.maskType, 'unexplored', 'default mask type should mark unexplored tiles');
    assert.ok(directMask.mask.has('0,0'), 'payload should include provided mask keys');

    let callbackPayload = null;
    const providerMask = resolveFogTileMask(
        {
            frontierOnly: true,
            tileMaskProvider: ({ state }) => (state === 'COMBAT' ? ['1,0', '2,0'] : []),
            onMaskResolved: payload => { callbackPayload = payload; }
        },
        { state: 'COMBAT', layout: { size: 30 } }
    );

    assert.ok(providerMask, 'provider mask should resolve when provider returns data');
    assert.deepStrictEqual(providerMask.mask, ['1,0', '2,0'], 'provider output should flow through payload');
    assert.strictEqual(providerMask.maskType, 'frontier', 'frontier flag should adjust mask type label');
    assert.strictEqual(providerMask.frontierOnly, true, 'payload should carry frontier boolean through');
    assert.deepStrictEqual(callbackPayload.mask, ['1,0', '2,0'], 'mask resolution callback should receive mask payload');
    assert.strictEqual(callbackPayload.context.state, 'COMBAT', 'callback should include passthrough context');

    const overworld = new Map([
        ['0,0', {}],
        ['1,0', {}]
    ]);
    const claimable = new Map([
        ['2,0', {}]
    ]);
    const combat = new Map([
        ['3,0', { owner: 'Player' }],
        ['4,0', { owner: 'Enemy' }]
    ]);

    const combatVisibility = buildTileVisibilityMap({
        state: 'COMBAT',
        overworld,
        claimable,
        combat
    });

    assert.strictEqual(
        combatVisibility.has('0,0'),
        false,
        'combat visibility should omit overworld tile outlines'
    );
    assert.strictEqual(
        combatVisibility.has('2,0'),
        false,
        'combat visibility should omit frontier/claimable outlines'
    );
    assert.strictEqual(
        combatVisibility.get('3,0'),
        TILE_VISIBILITY.VISIBLE,
        'player combat tiles should remain visible when fog applies'
    );
    assert.strictEqual(
        combatVisibility.get('4,0'),
        TILE_VISIBILITY.SEEN,
        'enemy combat tiles should stay dimmed rather than hidden'
    );

    console.log('All fog mask tests passed.');
}

run();
