import assert from 'assert';
import { createGameCore } from '../scripts/game/core.js';

const stubElement = () => ({
    style: {},
    textContent: '',
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    setAttribute: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    dataset: {}
});

function setupDom() {
    const debugLog = { textContent: '', classList: { add: () => {} } };
    const canvasStub = { getContext: () => ({}) };
    const fxLayerStub = { innerHTML: '' };
    const genericElement = stubElement();

    global.document = {
        getElementById(id) {
            if (id === 'debug-log') return debugLog;
            if (id === 'canvas') return canvasStub;
            if (id === 'fx-layer') return fxLayerStub;
            if (id === 'game-container') return genericElement;
            if (id === 'audio-debug' || id === 'audio-debug-panel') return genericElement;
            return genericElement;
        },
        querySelectorAll: () => [],
        createElement: () => ({ ...genericElement }),
        body: genericElement
    };

    global.window = {
        innerWidth: 800,
        innerHeight: 600,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {},
        localStorage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
            clear: () => {},
            key: () => null,
            length: 0
        }
    };

    global.performance = { now: () => 0 };
    global.requestAnimationFrame = () => 1;
}

function stubGameRuntime(Game) {
    Game.updateHUD = () => {};
    Game.updateUpgradeMenu = () => {};
    Game.updateResearchUI = () => {};
    Game.updateLeaderboardUI = () => {};
    Game.updateSaveSlotsUI = () => {};
    Game.updateTileInspector = () => {};
    Game.updateSaveStatus = () => {};
    Game.showOverworldUI = () => {};
    Game.resize = () => {};
    Game.armAmbientLoop = () => {};
    Game.bindVoidClickEasterEgg = () => {};
    Game.flushPendingNotifications = () => {};
    Game.armRenderLoop = () => {};
    Game.resetSession = () => {};
    Game.setupInput = () => {};
    Game.bootstrapNewWorld = () => {};
    Game.initNarrativeSystem = () => {};
}

async function run() {
    setupDom();

    let initCalls = 0;
    const introOverlay = {
        initialized: true,
        init: () => {
            initCalls += 1;
            return true;
        }
    };

    const { Game } = createGameCore({ dependencies: { introOverlay } });
    stubGameRuntime(Game);

    Game.init({
        introOverlay,
        loadSnapshot: () => ({ state: null, stats: { ...Game.stats }, slot: '1' }),
        onHUDUpdate: () => {},
        onSaveSlotsUpdate: () => {},
        onPostInit: () => {}
    });

    assert.strictEqual(initCalls, 0, 'Game.init should not re-run intro overlay init after bootstrap');
    assert.strictEqual(Game.introOverlay, introOverlay, 'Game should retain the injected intro overlay');
    console.log('Intro overlay init guard test passed.');
}

await run();
