import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const scriptPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'scripts', 'bootstrap', 'gameBootstrap.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');
const sanitizedSource = scriptSource
    .replace(/import[\s\S]*?from\s+['"][^'\"]+['"];\s*/g, '')
    .replace(/import\s+['"][^'\"]+['"];\s*/g, '')
    .replace(/export\s+function\s+bootstrapGame/, 'function bootstrapGame')
    .replace(/export\s+default\s+bootstrapGame;?/g, '');

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
    const TestHex = class {
        constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
        add(b) { return new TestHex(this.q + b.q, this.r + b.r, this.s + b.s); }
        toString() { return `${this.q},${this.r}`; }
        static neighbor(hex) { return hex; }
        static distance() { return 0; }
    };
    const testLayout = { f0: 1, f1: 1, f2: 0, f3: 1, b0: 1, b1: 1, b2: 0, b3: 1 };
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
        resolveFogTileMask: () => ({}),
        buildResearchStateSafe: () => ({ technologies: [], bonuses: { clusterBaseRate: 0.25 } }),
        START_TICK: 0,
        FOG_VISUAL_CONFIG: {},
        FOG_VISUAL_MODES: { VOID: 'VOID' },
        resolveFogInnerOpacity: () => 1,
        resolveFogParallax: () => 1,
        resolveFogVisualConfig: () => ({}),
        validateBootstrapDependencies: ({ persistence }) => ({ persistenceAvailable: Boolean(persistence) }),
        resolveHexGrid: () => ({ Hex: TestHex, Layout: testLayout, SQRT3: Math.sqrt(3) }),
        resolveRenderConfig: () => ({
            CAMERA_MOTION_CONFIG: { enabled: true, amplitude: 1, parallax: 1, speed: 1 },
            AMBIENCE_CONFIG: { enabled: false }
        }),
        RenderConfig: { CAMERA_MOTION_CONFIG: { enabled: true }, AMBIENCE_CONFIG: { enabled: false } },
        HexGrid: { Hex: TestHex, Layout: testLayout, SQRT3: Math.sqrt(3) }
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

    context.bootstrapGame({ documentRef: document, windowRef: windowStub });

    (document.listeners['DOMContentLoaded'] || []).forEach(cb => cb());

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
