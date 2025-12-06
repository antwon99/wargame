const assert = require('assert');

async function run() {
    const { resolveFogTileMask } = await import('../scripts/fogMask.js');

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

    console.log('All fog mask tests passed.');
}

run();
