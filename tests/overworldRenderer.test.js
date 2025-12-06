const assert = require('assert');

async function run() {
    const { drawOverworldTiles } = await import('../scripts/overworldRenderer.js');

    const overworld = {
        hexes: new Map([
            ['castle', { hex: { id: 'castle' }, type: 'castle' }],
            ['forest', { hex: { id: 'forest' }, type: 'forest' }]
        ]),
        claimable: new Map([
            ['1,0', 15]
        ])
    };

    const events = [];
    const layout = {};
    const drawHex = (_layout, hex) => events.push(`draw:${hex.id || hex}`);
    const parseKey = (key) => ({ id: key });
    const drawTileFog = (hex) => events.push(`fog:${hex.id || hex}`);

    drawOverworldTiles(overworld, { layout, drawHex, parseKey, drawTileFog });

    assert.deepStrictEqual(events, [
        'draw:castle',
        'fog:castle',
        'draw:forest',
        'fog:forest',
        'draw:1,0'
    ], 'tile fog hook should run immediately after each tile draw');

    console.log('Overworld renderer tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
