const assert = require('assert');

async function run() {
    const { drawOverworldTiles } = await import('../scripts/overworldRenderer.js');

    const overworld = {
        hexes: new Map([
            ['castle', { hex: { id: 'castle', toString() { return this.id; } }, type: 'castle' }],
            ['forest', { hex: { id: 'forest', toString() { return this.id; } }, type: 'forest' }]
        ]),
        claimable: new Map([
            ['1,0', 15]
        ])
    };

    const events = [];
    const fogCalls = [];
    const claimLabels = [];
    const layout = {};
    const drawHex = (_layout, hex, _fill, _stroke, _label, sub) => {
        events.push(`draw:${hex.id || hex}`);
        claimLabels.push(sub);
    };
    const parseKey = (key) => ({ id: key });
    const drawTileFog = (hex, _tile, visibility, fogState) => {
        events.push(`fog:${hex.id || hex}:${visibility}`);
        fogCalls.push({ hex: hex.id || hex, visibility, fogState });
    };

    const tileVisibility = new Map([
        ['castle', 'visible'],
        ['forest', 'seen']
    ]);

    drawOverworldTiles(overworld, { layout, drawHex, parseKey, drawTileFog, tileVisibility });

    assert.deepStrictEqual(events, [
        'draw:castle',
        'fog:castle:visible',
        'draw:forest',
        'fog:forest:seen',
        'draw:1,0'
    ], 'tile fog hook should run immediately after each tile draw');
    assert.deepStrictEqual(
        fogCalls,
        [
            {
                hex: 'castle',
                visibility: 'visible',
                fogState: {
                    visibility: 'visible',
                    isUnseen: false,
                    isSeen: false,
                    isVisible: true,
                    ambienceEnabled: true,
                    ambienceLayersEnabled: true
                }
            },
            {
                hex: 'forest',
                visibility: 'seen',
                fogState: {
                    visibility: 'seen',
                    isUnseen: false,
                    isSeen: true,
                    isVisible: false,
                    ambienceEnabled: true,
                    ambienceLayersEnabled: true
                }
            }
        ],
        'fog hook should receive normalized state flags for each tile'
    );
    assert.deepStrictEqual(claimLabels.filter(Boolean), [], 'claimable tiles should omit cost labels by default');

    const debugLabels = [];
    drawOverworldTiles(overworld, {
        layout,
        drawHex: (_layout, hex, _fill, _stroke, _label, sub) => debugLabels.push({ hex: hex.id || hex, sub }),
        parseKey,
        drawTileFog,
        showClaimCosts: true
    });
    assert.deepStrictEqual(debugLabels.filter((entry) => Boolean(entry.sub)), [
        { hex: '1,0', sub: '15w' }
    ], 'debug flag should opt claim cost stamps back in');

    const ambienceFogCalls = [];
    drawOverworldTiles(overworld, {
        layout,
        drawHex,
        parseKey,
        drawTileFog: (hex, tile, visibility, fogState) =>
            ambienceFogCalls.push({ hex: hex.id || hex, visibility, fogState }),
        tileVisibility,
        ambienceEnabled: false,
        ambienceLayersEnabled: false
    });
    assert.deepStrictEqual(
        ambienceFogCalls,
        [
            {
                hex: 'castle',
                visibility: 'visible',
                fogState: {
                    visibility: 'visible',
                    isUnseen: false,
                    isSeen: false,
                    isVisible: true,
                    ambienceEnabled: false,
                    ambienceLayersEnabled: false
                }
            },
            {
                hex: 'forest',
                visibility: 'seen',
                fogState: {
                    visibility: 'seen',
                    isUnseen: false,
                    isSeen: true,
                    isVisible: false,
                    ambienceEnabled: false,
                    ambienceLayersEnabled: false
                }
            }
        ],
        'ambience toggles should not change visibility state resolution passed into fog hooks'
    );

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
