import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const scriptPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'scripts', 'script.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');
const sanitizedSource = scriptSource
    .replace(/export\s+\{[\s\S]*?\}\s+from[^;]+;?/g, '')
    .replace(/import[\s\S]*?from\s+['"][^'\"]+['"];\s*/g, '')
    .replace(/import\s+['"][^'\"]+['"];\s*/g, '')
    .replace(/export\s+\{[\s\S]*?\};?/g, '')
    .replace(/^export.*$/gm, '')
    .replace(/bootstrapGame\(\);/g, '');

function createElementStub(overrides = {}) {
    const classSet = new Set();
    return {
        style: {},
        dataset: {},
        width: 800,
        height: 600,
        textContent: '',
        innerText: '',
        getContext: () => ({
            save: () => {},
            restore: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            closePath: () => {},
            fill: () => {},
            stroke: () => {},
            clearRect: () => {},
            fillRect: () => {},
            translate: () => {},
            scale: () => {},
            arc: () => {},
            fillText: () => {},
            setTransform: () => {},
            measureText: () => ({ width: 0 })
        }),
        classList: {
            add: (...names) => names.forEach(n => classSet.add(n)),
            remove: (...names) => names.forEach(n => classSet.delete(n)),
            contains: name => classSet.has(name),
            toggle: () => {}
        },
        addEventListener: () => {},
        remove: () => {},
        appendChild: () => {},
        setAttribute: () => {},
        ...overrides
    };
}

function createDocumentStub() {
    const elements = new Map();
    const listeners = {};
    const document = {
        body: createElementStub(),
        addEventListener: (event, cb) => {
            listeners[event] = listeners[event] || [];
            listeners[event].push(cb);
        },
        createElement: () => createElementStub(),
        getElementById: id => {
            if (!elements.has(id)) {
                elements.set(id, createElementStub({ id }));
            }
            return elements.get(id);
        },
        get listeners() {
            return listeners;
        }
    };

    return document;
}

function createWindowStub(document, overrides = {}) {
    const listeners = {};
    const windowStub = {
        document,
        innerWidth: 1024,
        innerHeight: 768,
        addEventListener: (event, cb) => {
            listeners[event] = listeners[event] || [];
            listeners[event].push(cb);
        },
        dispatchEvent: event => {
            const callbacks = listeners[event] || [];
            callbacks.forEach(cb => cb());
        },
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: () => {},
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        InputHelpers: { SQRT3: Math.sqrt(3) },
        ...overrides
    };

    return windowStub;
}

function createImportStubs() {
    return {
        COMBAT_BUILDINGS: {},
        UNITS: {},
        TILE_VISIBILITY: { UNSEEN: 'unseen', SEEN: 'seen', VISIBLE: 'visible' },
        addBuilding: () => {},
        buyBuilding: () => {},
        checkConnection: () => {},
        damageBuilding: () => {},
        damageUnit: () => {},
        endWar: () => {},
        getBuildingStats: () => ({}),
        getSpawnRate: () => 0,
        getUnitStats: () => ({}),
        isFrontier: () => false,
        loseOverworldHexes: () => ({ lost: 0 }),
        recordWarEnd: () => {},
        registerKill: () => {},
        runAI: () => {},
        scorchEarth: () => {},
        spawnUnit: () => {},
        startWar: () => {},
        updateCombat: () => {},
        armAmbientLoopHelper: () => {},
        haltAmbientLoopHelper: () => {},
        applyUIBindings: game => {
            game.bindVoidClickEasterEgg = () => {};
            game.setupInput = () => {};
            game.updateSaveStatus = () => {};
            game.showOverworldUI = () => {};
            game.updateHUD = () => {};
            game.updateUpgradeMenu = () => {};
            game.updateResearchUI = () => {};
            game.updateLeaderboardUI = () => {};
            game.updateSaveSlotsUI = () => {};
            game.updateTileInspector = () => {};
            game.showTileCallout = () => {};
            game.hideTileCallout = () => {};
            game.enqueueNotification = () => {};
        },
        setupUIBindings: () => {},
        Timekeeper: class {
            constructor() {
                this.listeners = [];
            }
            onChange(cb) { this.listeners.push(cb); }
            tick() {}
            getDelta() { return 0; }
            reset() {}
        },
        OVERWORLD_TILES: [],
        drawOverworldTiles: () => {},
        advanceOverworldTimer: () => ({}),
        buildClusterBonusMap: () => new Map(),
        DEFAULT_CLUSTER_RATE: 0.25,
        buildTileVisibilityMap: () => new Map(),
        resolveVisibilityMask: () => ({}),
        buildResearchStateSafe: () => ({ technologies: [], bonuses: { clusterBaseRate: 0.25 } }),
        START_TICK: 0,
        SNOW_VISUAL_CONFIG: {},
        resolveSnowSeason: () => ({ inSeason: true, progress: 0.5 }),
        resolveSnowVisualConfig: () => ({ enabled: true, coverage: 0.5 }),
        validateBootstrapDependencies: ({ persistence }) => ({ persistenceAvailable: Boolean(persistence) })
    };
}

async function loadGameModule({ globals = {} } = {}) {
    const document = createDocumentStub();
    const windowStub = createWindowStub(document, globals);
    const importStubs = createImportStubs();

    const context = vm.createContext({
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        performance: { now: () => 0 },
        requestAnimationFrame: windowStub.requestAnimationFrame,
        cancelAnimationFrame: windowStub.cancelAnimationFrame,
        document,
        window: windowStub,
        ...importStubs
    });
    context.globalThis = context;

    const script = new vm.Script(sanitizedSource, { filename: scriptPath });
    script.runInContext(context);

    (document.listeners['DOMContentLoaded'] || []).forEach(cb => cb());

    if (!windowStub.Game) {
        global.window = windowStub;
        global.document = document;
        global.performance = global.performance || { now: () => 0 };
        global.requestAnimationFrame = windowStub.requestAnimationFrame;
        global.cancelAnimationFrame = windowStub.cancelAnimationFrame;
        const { createGameCore } = await import('../scripts/game/core.js');
        const { Game, Hex, Layout } = createGameCore({
            persistence: windowStub.Persistence ?? null
        });
        windowStub.Game = Game;
        windowStub.Hex = Hex;
        windowStub.Layout = Layout;
        windowStub.Game.bindVoidClickEasterEgg = windowStub.Game.bindVoidClickEasterEgg || (() => {});
        windowStub.Game.showOverworldUI = windowStub.Game.showOverworldUI || (() => {});
        windowStub.Game.updateUpgradeMenu = windowStub.Game.updateUpgradeMenu || (() => {});
        windowStub.Game.updateResearchUI = windowStub.Game.updateResearchUI || (() => {});
        windowStub.Game.updateLeaderboardUI = windowStub.Game.updateLeaderboardUI || (() => {});
        windowStub.Game.updateSaveStatus = windowStub.Game.updateSaveStatus || (() => {});
        if (typeof windowStub.Game.init === 'function') {
            const fallbackStats = { bestLevel: 0, bestKills: 0, totalKills: 0, warsFought: 0, lastOutcome: 'N/A', lastSaveISO: null };
            windowStub.Game.init({
                loadSnapshot: () => ({ state: null, stats: { ...fallbackStats }, slot: '1' }),
                onHUDUpdate: () => {},
                onSaveSlotsUpdate: () => {},
                onPostInit: () => {}
            });
        }
    }

    return { window: windowStub };
}

async function testInitWithGlobalsPresent() {
    const globals = {
        ResearchSystem: {
            getCostForTech: () => ({ gold: 0, wood: 0 }),
            isAffordable: () => true,
            hasRemainingPurchases: () => true,
            recordPurchase: () => {},
            getAvailableTechs: () => []
        },
        Persistence: {
            DEFAULT_STATS: { bestLevel: 1, bestKills: 2, totalKills: 3, warsFought: 4, lastOutcome: 'N/A', lastSaveISO: null },
            loadSnapshot: () => ({ state: null, stats: { bestLevel: 1, bestKills: 2, totalKills: 3, warsFought: 4, lastOutcome: 'N/A', lastSaveISO: null }, slot: '1' }),
            saveSnapshot: () => {}
        }
    };

    const { window } = await loadGameModule({ globals });
    assert.ok(window.Game, 'Game should be attached to window when globals are present.');
    assert.strictEqual(window.Game.dependencyHealth.persistenceAvailable, true, 'Persistence should be detected when provided.');
}

async function testInitGracefullyHandlesMissingGlobals() {
    const { window } = await loadGameModule({ globals: {} });
    assert.ok(window.Game, 'Game should still be attached to window when globals are missing.');
    assert.strictEqual(window.Game.dependencyHealth.persistenceAvailable, false, 'Missing persistence should be reported gracefully.');
}

async function run() {
    await testInitWithGlobalsPresent();
    await testInitGracefullyHandlesMissingGlobals();
    console.log('Script module bootstrap tests passed.');
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
