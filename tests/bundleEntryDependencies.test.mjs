import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const entryPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'scripts', 'bundle-entry.js');
const entrySource = fs.readFileSync(entryPath, 'utf8');

function transformToCommonJs(source) {
    return source
        .replace(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];/g, 'const {$1} = require("$2");')
        .replace(/import\s+([^\s]+)\s+from\s+['"]([^'"]+)['"];/g, 'const $1 = require("$2");');
}

function createStubs() {
    const inputHelpers = {
        Layout: { id: 'layout' },
        SQRT3: 1.732,
        isPointerOnDrawnHex: () => 'hit',
        pixelToAxial: () => 'axial',
        cubeToPixel: () => 'pixel'
    };
    const introOverlay = { init: () => 'intro' };
    const researchSystem = { name: 'research' };
    const rebelSystem = { name: 'rebel' };
    const tutorialHandler = { name: 'tutorial' };
    const imperialMandates = { recordEvent: () => {} };
    const imperialMandateManager = { advanceTick: () => {} };
    const platformAdapter = { detectPlatformProfile: () => ({}) };
    const tutorialCallouts = { start: () => {} };
    const persistence = { loadSnapshot: () => ({}) };
    const storageProbe = { canUseLocalStorage: () => true };
    const gameAudio = { play: () => {} };
    const debugToggles = { showClaimCosts: true };

    return {
        inputHelpers,
        introOverlay,
        researchSystem,
        rebelSystem,
        tutorialHandler,
        imperialMandates,
        imperialMandateManager,
        platformAdapter,
        tutorialCallouts,
        persistence,
        storageProbe,
        gameAudio,
        debugToggles
    };
}

function loadEntryModule() {
    const stubs = createStubs();
    const transformed = transformToCommonJs(entrySource);
    let capturedBootstrap = null;
    let bootstrapArgs = null;

    const context = vm.createContext({
        require: (specifier) => {
            switch (specifier) {
                case './inputHelpers.js':
                    return {
                        Layout: stubs.inputHelpers.Layout,
                        SQRT3: stubs.inputHelpers.SQRT3,
                        cubeToPixel: stubs.inputHelpers.cubeToPixel,
                        isPointerOnDrawnHex: stubs.inputHelpers.isPointerOnDrawnHex,
                        pixelToAxial: stubs.inputHelpers.pixelToAxial,
                        initInputHelpers: () => stubs.inputHelpers
                    };
                case './introOverlay.js':
                    return {
                        IntroOverlay: stubs.introOverlay
                    };
                case './audio.js':
                    return {
                        GameAudio: stubs.gameAudio,
                        initAudio: () => ({ GameAudio: stubs.gameAudio })
                    };
                case './juice.js':
                    return { initJuice: () => {} };
                case './persistence.js':
                    stubs.persistence.initPersistence = () => stubs.persistence;
                    return stubs.persistence;
                case './researchSystem.js':
                    return { ResearchSystem: stubs.researchSystem, initResearchSystem: () => stubs.researchSystem };
                case './voidEasterEgg.js':
                    return { initVoidEasterEgg: () => {} };
                case './platform.js':
                    return { PlatformAdapter: stubs.platformAdapter, initPlatformAdapter: () => stubs.platformAdapter };
                case './debugToggle.js':
                    return {
                        initDebugToggle: (target) => {
                            target.DebugToggles = stubs.debugToggles;
                            return {};
                        }
                    };
                case './rebelSystem.js':
                    return { RebelSystem: stubs.rebelSystem, initRebelSystem: () => stubs.rebelSystem };
                case './tutorialHandler.js':
                    return { TutorialHandler: stubs.tutorialHandler, initTutorialHandler: () => stubs.tutorialHandler };
                case './tutorialCallouts.js':
                    return { TutorialCallouts: stubs.tutorialCallouts, initTutorialCallouts: () => stubs.tutorialCallouts };
                case './mandates/imperialMandateCalendar.js':
                    return { initImperialMandateCalendar: () => {} };
                case './mandates/imperialMandatesCore.js':
                    return { initImperialMandatesCore: () => ({ createImperialMandates: () => ({}) }) };
                case './mandates/imperialMandatesAdapter.js':
                    return { initImperialMandatesAdapter: () => ({}) };
                case './mandates/imperialMandateManager.js':
                    return {
                        initImperialMandateManager: () => stubs.imperialMandateManager
                    };
                case './mandates/imperialMandates.js':
                    return { initImperialMandates: () => stubs.imperialMandates };
                case './bootOverlay.js':
                    return { BootOverlay: {} };
                case './storageProbe.js':
                    return { initStorageProbe: () => stubs.storageProbe };
                case './script.js':
                    return {
                        bootstrapGame: (deps) => {
                            bootstrapArgs = deps;
                            return {};
                        },
                        createGameCore: () => ({})
                    };
                case './globalShim.js':
                    return {
                        publishBootstrapHandles: (bootstrap) => {
                            capturedBootstrap = bootstrap;
                        }
                    };
                default:
                    throw new Error(`Unexpected module: ${specifier}`);
            }
        },
        console
    });
    context.globalThis = context;

    const script = new vm.Script(transformed, { filename: entryPath });
    script.runInContext(context);

    return {
        stubs,
        capturedBootstrap,
        getBootstrapArgs: () => bootstrapArgs
    };
}

async function testBundleEntryDependencies() {
    const { stubs, capturedBootstrap, getBootstrapArgs } = loadEntryModule();

    assert.ok(capturedBootstrap, 'bootstrap handle should be published.');
    capturedBootstrap();

    const bootstrapArgs = getBootstrapArgs();
    assert.ok(bootstrapArgs, 'bootstrapGame should receive dependencies.');
    assert.strictEqual(bootstrapArgs.inputHelpers, stubs.inputHelpers);
    assert.strictEqual(bootstrapArgs.introOverlay, stubs.introOverlay);
    assert.strictEqual(bootstrapArgs.researchSystem, stubs.researchSystem);
    assert.strictEqual(bootstrapArgs.rebelSystem, stubs.rebelSystem);
    assert.strictEqual(bootstrapArgs.tutorialHandler, stubs.tutorialHandler);
    assert.strictEqual(bootstrapArgs.imperialMandates, stubs.imperialMandates);
    assert.strictEqual(bootstrapArgs.imperialMandateManager, stubs.imperialMandateManager);
    assert.strictEqual(bootstrapArgs.platformAdapter, stubs.platformAdapter);
    assert.strictEqual(bootstrapArgs.tutorialCallouts, stubs.tutorialCallouts);
    assert.strictEqual(bootstrapArgs.persistence, stubs.persistence);
    assert.strictEqual(bootstrapArgs.storageProbe, stubs.storageProbe);
    assert.strictEqual(bootstrapArgs.gameAudio, stubs.gameAudio);
    assert.strictEqual(bootstrapArgs.debugToggles, stubs.debugToggles);
}

async function run() {
    await testBundleEntryDependencies();
    console.log('Bundle entry dependencies test passed.');
}

await run();
