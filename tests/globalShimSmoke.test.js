const assert = require('assert');
const { ensureGlobalShims, publishBootstrapHandles } = require('../scripts/globalShim.js');

function run() {
    const scope = {};
    const providers = {
        InputHelpers: { Layout: {}, SQRT3: Math.sqrt(3) },
        ResearchSystem: { BASE_TECHNOLOGIES: [] },
        RebelSystem: {},
        ImperialMandates: {},
        ImperialMandateManager: {},
        PlatformAdapter: { detectPlatformProfile: () => ({}) },
        TutorialCallouts: {},
        IntroOverlay: {},
        Persistence: {},
        StorageProbe: {}
    };

    const missing = ensureGlobalShims(scope, providers);
    assert.deepStrictEqual(missing, [], 'shim should populate all required globals');

    let didBootstrap = false;
    publishBootstrapHandles(() => { didBootstrap = true; }, () => ({}), scope);
    assert.strictEqual(typeof scope.bootstrapGame, 'function');
    assert.strictEqual(typeof scope.createGameCore, 'function');
    scope.bootstrapGame();
    assert.ok(didBootstrap, 'published bootstrap should be callable');

    assert.throws(() => ensureGlobalShims({}, {}), /Missing required globals/, 'missing globals should throw');

    console.log('Global shim smoke test passed.');
}

run();
