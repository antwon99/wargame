const assert = require('assert');

const MODULE_PATH = '../scripts/render/config.js';

function loadRenderConfig(windowObj) {
    delete require.cache[require.resolve(MODULE_PATH)];
    if (windowObj === undefined) {
        delete global.window;
    } else {
        global.window = windowObj;
    }
    return require(MODULE_PATH);
}

function normalizeRenderConfig(mod) {
    return mod.default && mod.default.resolveRenderConfig ? mod.default : mod;
}

function restoreWindow(originalWindow) {
    if (originalWindow === undefined) {
        delete global.window;
    } else {
        global.window = originalWindow;
    }
}

function testDefaultConfigsAndResolution() {
    const originalWindow = global.window;

    try {
        const moduleExports = loadRenderConfig();
        const RenderConfig = normalizeRenderConfig(moduleExports);
        const { CAMERA_MOTION_CONFIG, AMBIENCE_CONFIG, resolveRenderConfig } = RenderConfig;

        assert.strictEqual(
            moduleExports.CAMERA_MOTION_CONFIG || moduleExports.default.CAMERA_MOTION_CONFIG,
            CAMERA_MOTION_CONFIG,
            'module should surface camera config as a named export'
        );

        assert.deepStrictEqual(
            CAMERA_MOTION_CONFIG,
            { enabled: true, amplitude: 9, parallax: 0.65, speed: 0.18 },
            'Camera defaults should match tuned idle drift'
        );

        assert.strictEqual(AMBIENCE_CONFIG.enabled, false, 'Ambience should default to disabled for performance');
        assert.strictEqual(AMBIENCE_CONFIG.layers.length, 3, 'Ambience layers should include multiple parallax bands');
        assert.ok(AMBIENCE_CONFIG.layers.every(layer => 'opacity' in layer && 'drift' in layer), 'Ambience layers should expose opacity and drift');

        const overrides = resolveRenderConfig({
            renderConfigModule: {
                CAMERA_MOTION_CONFIG: { enabled: false },
                AMBIENCE_CONFIG: { enabled: true, layers: [] }
            }
        });

        assert.strictEqual(overrides.CAMERA_MOTION_CONFIG.enabled, false, 'resolveRenderConfig should honor injected camera overrides');
        assert.strictEqual(overrides.AMBIENCE_CONFIG.enabled, true, 'resolveRenderConfig should honor injected ambience overrides');
        assert.deepStrictEqual(overrides.AMBIENCE_CONFIG.layers, [], 'resolveRenderConfig should carry through provided ambience layers');
    } finally {
        restoreWindow(originalWindow);
    }
}

function testWindowAttachment() {
    const originalWindow = global.window;
    const stubWindow = {};

    try {
        const moduleExports = loadRenderConfig(stubWindow);
        const RenderConfig = normalizeRenderConfig(moduleExports);
        assert.ok(stubWindow.RenderConfig, 'RenderConfig should attach to window when available');

        const resolved = RenderConfig.resolveRenderConfig({ windowObj: stubWindow });
        assert.strictEqual(resolved.CAMERA_MOTION_CONFIG, RenderConfig.CAMERA_MOTION_CONFIG, 'resolveRenderConfig should prefer window config when present');
        assert.strictEqual(resolved.AMBIENCE_CONFIG, RenderConfig.AMBIENCE_CONFIG, 'resolveRenderConfig should expose window ambience defaults');
    } finally {
        restoreWindow(originalWindow);
    }
}

function run() {
    testWindowAttachment();
    testDefaultConfigsAndResolution();
    console.log('All render config tests passed.');
}

run();
