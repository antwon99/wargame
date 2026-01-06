import assert from 'assert';
import { buildBootstrapDependencies, ensureGlobalShims, publishBootstrapHandles } from '../scripts/globalShim.js';

function run() {
    const scope = {};
    const providers = {
        InputHelpers: { Layout: {}, SQRT3: Math.sqrt(3) },
        ResearchSystem: { BASE_TECHNOLOGIES: [] },
        RebelSystem: {},
        TutorialHandler: {},
        ImperialMandates: {},
        ImperialMandateManager: {},
        PlatformAdapter: { detectPlatformProfile: () => ({}) },
        TutorialCallouts: {},
        IntroOverlay: {},
        Persistence: {},
        StorageProbe: {}
    };

    const dependencies = buildBootstrapDependencies(scope, {
        inputHelpers: providers.InputHelpers,
        researchSystem: providers.ResearchSystem,
        rebelSystem: providers.RebelSystem,
        tutorialHandler: providers.TutorialHandler,
        imperialMandates: providers.ImperialMandates,
        imperialMandateManager: providers.ImperialMandateManager,
        platformAdapter: providers.PlatformAdapter,
        tutorialCallouts: providers.TutorialCallouts,
        introOverlay: providers.IntroOverlay,
        persistence: providers.Persistence,
        storageProbe: providers.StorageProbe
    });
    assert.strictEqual(scope.InputHelpers, undefined, 'dependency builder should not mutate scope');
    assert.strictEqual(dependencies.inputHelpers, providers.InputHelpers, 'dependency builder should use explicit providers');

    const missing = ensureGlobalShims(scope, providers);
    assert.deepStrictEqual(missing, [], 'shim should populate all required globals when invoked');

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
