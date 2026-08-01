import assert from 'assert';

async function run() {
    const { createGameCore } = await import('../scripts/game/core.js');

    const consoleErrors = [];
    const consoleDebugs = [];
    const originalConsoleError = console.error;
    const originalConsoleDebug = console.debug;
    console.error = (...args) => consoleErrors.push(args.join(' '));
    console.debug = (...args) => consoleDebugs.push(args.join(' '));

    const debugLog = { textContent: '', classList: { add: () => {} } };
    const canvasStub = { getContext: () => ({}) };
    const genericElement = {
        style: {},
        textContent: '',
        addEventListener: () => {},
        onclick: null,
        dataset: {},
        appendChild: () => {},
        setAttribute: () => {},
        className: '',
        classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} }
    };

    global.document = {
        getElementById(id) {
            if (id === 'debug-log') return debugLog;
            if (id === 'canvas') return canvasStub;
            if (id === 'fx-layer') return { innerHTML: '' };
            if (id === 'game-container') return genericElement;
            return genericElement;
        },
        querySelectorAll: () => [],
        createElement: () => ({ ...genericElement }),
        body: genericElement
    };

    global.window = {
        innerWidth: 800,
        innerHeight: 600,
        addEventListener: () => {}
    };

    global.performance = { now: () => 0 };
    global.requestAnimationFrame = () => 1;
    global.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0
    };

    try {
        const { Game } = createGameCore();
        const notifications = [];
        Game.enqueueNotification = (payload) => notifications.push(payload);
        Game.applySnapshot = () => { throw new Error('corrupt snapshot'); };
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

        Game.init({
            loadSnapshot: () => ({
                state: { gold: 10, overworld: null, custom: true },
                stats: { },
                slot: '2'
            })
        });

        assert.ok(
            consoleErrors.some((entry) => entry.includes('Context: snapshot apply')),
            'applySnapshot failures should be logged with snapshot apply context'
        );
        assert.ok(
            consoleDebugs.some((entry) => entry.includes('Snapshot load failed diagnostics')),
            'snapshot diagnostics should be logged to the console'
        );
        assert.ok(
            debugLog.textContent.includes('Snapshot diagnostics:'),
            'debug overlay should include snapshot diagnostics'
        );
        assert.ok(
            debugLog.textContent.includes('Slot: 2'),
            'diagnostics should include the save slot'
        );
        assert.ok(
            debugLog.textContent.includes('gold, overworld, custom'),
            'diagnostics should list snapshot keys'
        );
        assert.ok(
            notifications.some((payload) => payload.id === 'snapshot-fallback'),
            'fallback notification should be queued when a snapshot fails to apply'
        );
    } finally {
        console.error = originalConsoleError;
        console.debug = originalConsoleDebug;
    }
}

await run();
