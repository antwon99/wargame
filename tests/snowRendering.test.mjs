import assert from 'assert';

function createRecordingContext() {
    const operations = [];
    return {
        operations,
        get fillStyle() {
            return operations.contextFillStyle || '#000';
        },
        set fillStyle(value) {
            operations.contextFillStyle = value;
        },
        fillRect: (x, y, w, h) => operations.push({ type: 'fillRect', style: `fill:${operations.contextFillStyle}`, rect: [x, y, w, h] })
    };
}

function createDocumentStub(ctx) {
    const canvas = { getContext: () => ctx };
    const fxLayer = { getContext: () => ctx };
    const elements = new Map([
        ['canvas', canvas],
        ['fx-layer', fxLayer],
        ['debug-log', { classList: { add: () => {} }, textContent: '' }],
        ['reclamation-hint', {}]
    ]);
    return {
        getElementById: (id) => elements.get(id) || { getContext: () => ctx },
        addEventListener: () => {},
        body: { appendChild: () => {} }
    };
}

function createWindowStub(document) {
    return {
        document,
        innerWidth: 800,
        innerHeight: 600,
        devicePixelRatio: 1,
        addEventListener: () => {},
        requestAnimationFrame: (fn) => fn(0),
        cancelAnimationFrame: () => {},
        PlatformAdapter: undefined,
        InputHelpers: {
            SQRT3: Math.sqrt(3),
            Layout: { f0: Math.sqrt(3), f1: Math.sqrt(3) / 2, f2: 0, f3: 3 / 2, b0: Math.sqrt(3) / 3, b1: -1 / 3, b2: 0, b3: 2 / 3 }
        }
    };
}

async function run() {
    const ctx = createRecordingContext();
    global.document = createDocumentStub(ctx);
    global.window = createWindowStub(global.document);
    global.window.IntroOverlay = { init: () => {} };

    const { createGameCore } = await import('../scripts/game/core.js');
    const { START_TICK } = await import('../scripts/timekeeper.js');
    const { SNOW_VISUAL_CONFIG } = await import('../scripts/snowVisualConfig.mjs');

    const { Game, Layout } = createGameCore();
    Game.ctx = ctx;
    Game.viewport = { width: 800, height: 600 };
    Game.cam = { x: 0, y: 0, zoom: 1 };
    Game.overworld = { hexes: new Map(), claimable: new Map(), timer: 0, tickRate: 3.5, clusterBonuses: new Map() };
    Game.state = 'OVERWORLD';

    Game.featureToggles.snow = { ...SNOW_VISUAL_CONFIG, snowfallEnabled: true, enabled: true };
    Game.renderSnowOverlay({ origin: Game.cam, size: 30, ...Layout }, { currentDate: new Date('2024-12-15T00:00:00Z') });

    const overlayFill = ctx.operations.find(op => op.type === 'fillRect' && op.style?.startsWith('fill:rgba(255, 255, 255'));
    assert.ok(overlayFill, 'snow overlay should wash the viewport in winter');

    ctx.operations.length = 0;
    Game.featureToggles.snow = { ...SNOW_VISUAL_CONFIG, enabled: false };
    Game.renderSnowOverlay({ origin: Game.cam, size: 30, ...Layout }, { currentDate: new Date('2024-12-15T00:00:00Z') });
    const seasonalFillCount = ctx.operations.filter(op => op.type === 'fillRect').length;
    assert.strictEqual(seasonalFillCount, 1, 'disabled snow should only draw the base clear');

    ctx.operations.length = 0;
    Game.featureToggles.snow = { ...SNOW_VISUAL_CONFIG };
    Game.timekeeper.reset(START_TICK);
    Game.renderSnowOverlay({ origin: Game.cam, size: 30, ...Layout });
    const aprilFill = ctx.operations.find(op => op.style?.startsWith('fill:rgba(255, 255, 255'));
    assert.strictEqual(aprilFill, undefined, 'campaign start month (April) should begin snow-free');

    console.log('Snow rendering tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
