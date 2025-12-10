const assert = require('assert');

const MODULE_PATH = '../scripts/grid/hexGrid.js';

function loadHexGrid(windowObj) {
    delete require.cache[require.resolve(MODULE_PATH)];
    if (windowObj === undefined) {
        delete global.window;
    } else {
        global.window = windowObj;
    }
    return require(MODULE_PATH);
}

function normalizeHexGrid(mod) {
    return mod.default && mod.default.Hex ? mod.default : mod;
}

function restoreWindow(originalWindow) {
    if (originalWindow === undefined) {
        delete global.window;
    } else {
        global.window = originalWindow;
    }
}

function testExportsInHeadlessContext() {
    const originalWindow = global.window;

    try {
        const moduleExports = loadHexGrid();
        const HexGrid = normalizeHexGrid(moduleExports);
        const { Hex, Layout, SQRT3, resolveHexGrid } = HexGrid;

        assert.strictEqual(moduleExports.Hex || moduleExports.default.Hex, Hex, 'module should surface Hex as a named export');

        assert.strictEqual(typeof Hex, 'function', 'Hex should be exported for headless consumers');
        assert.strictEqual(typeof Layout, 'object', 'Layout coefficients should be exported');
        assert.strictEqual(SQRT3, Math.sqrt(3), 'SQRT3 constant should expose square root of three');
        assert.strictEqual(resolveHexGrid().Hex, Hex, 'resolveHexGrid should fall back to bundled helpers');

        const origin = new Hex(0, 0);
        const neighbor = Hex.neighbor(origin, 0);
        assert.strictEqual(neighbor.toString(), '1,0', 'neighbor traversal should move along axial axes');
        assert.strictEqual(Hex.distance(origin, new Hex(2, -1)), 2, 'distance should measure axial steps');

        const layout = { ...Layout, size: 20, origin: { x: 10, y: -2 } };
        const axial = new Hex(1, -1);
        const pixel = axial.toPixel(layout);
        const rounded = Hex.fromPixel(layout, pixel);
        assert.ok(rounded.equals(axial), 'round-trip pixel conversion should land on the same hex');
    } finally {
        restoreWindow(originalWindow);
    }
}

function testWindowAttachmentAndResolution() {
    const originalWindow = global.window;
    const stubWindow = {};

    try {
        const moduleExports = loadHexGrid(stubWindow);
        const HexGrid = normalizeHexGrid(moduleExports);

        assert.ok(stubWindow.HexGrid, 'HexGrid should attach to window when available');
        assert.strictEqual(stubWindow.HexGrid.Hex, HexGrid.Hex, 'window attachment should expose the same helpers');

        const resolved = HexGrid.resolveHexGrid({ windowObj: stubWindow });
        assert.strictEqual(resolved.Hex, HexGrid.Hex, 'resolveHexGrid should prefer window-sourced helpers when present');
        assert.strictEqual(resolved.Layout, HexGrid.Layout, 'resolveHexGrid should expose the window layout coefficients');
    } finally {
        restoreWindow(originalWindow);
    }
}

function run() {
    testWindowAttachmentAndResolution();
    testExportsInHeadlessContext();
    console.log('All hex grid tests passed.');
}

run();
