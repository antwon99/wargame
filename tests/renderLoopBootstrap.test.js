const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Persistence = require('../scripts/persistence.js');

const scriptPath = path.join(__dirname, '..', 'scripts', 'bootstrap', 'gameBootstrap.js');
const sanitizedSource = fs.readFileSync(scriptPath, 'utf8')
    .replace(/import[\s\S]*?from\s+['"][^'\"]+['"];\s*/g, '')
    .replace(/import\s+['"][^'\"]+['"];\s*/g, '')
    .replace(/export\s+function\s+bootstrapGame/, 'function bootstrapGame')
    .replace(/export\s+default\s+bootstrapGame;?/g, '');

const rafCalls = [];
const canvasStub = { width: 0, height: 0, getContext: () => ({}) };
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

function createDocumentStub() {
    const listeners = {};
    return {
        listeners,
        addEventListener(event, cb) {
            listeners[event] = listeners[event] || [];
            listeners[event].push(cb);
        },
        getElementById(id) {
            if (id === 'canvas') return canvasStub;
            if (id === 'fx-layer') return { innerHTML: '' };
            if (id === 'game-container') return genericElement;
            if (id === 'debug-log') return { ...genericElement };
            return genericElement;
        },
        querySelectorAll: () => [],
        createElement: () => ({ ...genericElement }),
        body: genericElement
    };
}

function createWindowProxy(document) {
    const listeners = {};
    const windowProxy = new Proxy({}, {
        set(target, prop, value) {
            if (prop === 'Game') {
                value.setupInput = () => { throw new Error('input init failed'); };
            }
            target[prop] = value;
            return true;
        }
    });

    windowProxy.addEventListener = (event, cb) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
    };
    windowProxy.removeEventListener = () => {};
    windowProxy.dispatchEvent = (event) => {
        (listeners[event] || []).forEach(cb => cb());
    };
    windowProxy.document = document;
    windowProxy.innerWidth = 1024;
    windowProxy.innerHeight = 768;
    windowProxy.requestAnimationFrame = (cb) => { rafCalls.push(cb); return 1; };
    windowProxy.cancelAnimationFrame = () => {};
    windowProxy.setTimeout = setTimeout;
    windowProxy.clearTimeout = clearTimeout;
    windowProxy.setInterval = setInterval;
    windowProxy.clearInterval = clearInterval;
    windowProxy.performance = { now: () => 42 };
    windowProxy.InputHelpers = { SQRT3: Math.sqrt(3), Layout: {} };
    return windowProxy;
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
        applyUIBindings: game => { game.bindVoidClickEasterEgg = () => {}; game.setupInput = () => {}; },
        setupUIBindings: () => {},
        Timekeeper: class { onChange() {} tick() {} getDelta() { return 0; } reset() {} },
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
        resolveRenderConfig: () => ({ CAMERA_MOTION_CONFIG: { enabled: true }, AMBIENCE_CONFIG: { enabled: false } }),
        RenderConfig: { CAMERA_MOTION_CONFIG: { enabled: true }, AMBIENCE_CONFIG: { enabled: false } },
        HexGrid: { Hex: TestHex, Layout: testLayout, SQRT3: Math.sqrt(3) },
        AmbienceRenderer: class {}
    };
}

const document = createDocumentStub();
const windowProxy = createWindowProxy(document);

const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance: { now: () => 42 },
    requestAnimationFrame: windowProxy.requestAnimationFrame,
    cancelAnimationFrame: windowProxy.cancelAnimationFrame,
    document,
    window: windowProxy,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 },
    ...createImportStubs(),
    Persistence
});
context.globalThis = context;

new vm.Script(sanitizedSource, { filename: scriptPath }).runInContext(context);
context.bootstrapGame({ documentRef: document, windowRef: windowProxy });
(document.listeners['DOMContentLoaded'] || []).forEach(cb => cb());

function run() {
    const Game = windowProxy.Game;
    assert.ok(Game, 'Game should register on window after bootstrap');
    assert.strictEqual(Game.lastTime, 42, 'render loop primer should cache performance timestamp');
    assert.ok(rafCalls.length > 0, 'requestAnimationFrame should be armed even when init throws');
    console.log('Render loop bootstrap safety test passed.');
}

run();
