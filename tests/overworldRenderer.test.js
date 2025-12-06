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

    const warnings = [];
    const originalWarn = console.warn;
    const noop = () => {};

    try {
        console.warn = (...args) => warnings.push(args.join(' '));

        drawOverworldTiles({ hexes: new Map(), claimable: new Map() }, {
            layout,
            drawHex: noop,
            parseKey,
            drawTileFog: noop
        });
        drawOverworldTiles({ hexes: new Map(), claimable: new Map() }, {
            layout,
            drawHex: noop,
            parseKey,
            drawTileFog: noop
        });

        assert.strictEqual(warnings.length, 1, 'empty overworld draw should warn once per empty streak');

        drawOverworldTiles(overworld, { layout, drawHex: noop, parseKey, drawTileFog: noop });
        drawOverworldTiles({ hexes: new Map(), claimable: new Map() }, {
            layout,
            drawHex: noop,
            parseKey,
            drawTileFog: noop
        });

        assert.strictEqual(warnings.length, 2, 'warning should re-arm after a successful tile render');
    } finally {
        console.warn = originalWarn;
    }

    console.log('Overworld renderer tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
