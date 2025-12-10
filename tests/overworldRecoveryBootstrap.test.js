const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const scriptPath = path.join(__dirname, '..', 'scripts', 'bootstrap', 'gameBootstrap.js');
const sanitizedSource = fs.readFileSync(scriptPath, 'utf8')
    .replace(/import[\s\S]*?from\s+['"][^'\"]+['"];\s*/g, '')
    .replace(/import\s+['"][^'\"]+['"];\s*/g, '')
    .replace(/export\s+function\s+bootstrapGame/, 'function bootstrapGame')
    .replace(/export\s+default\s+bootstrapGame;?/g, '')
    .replace(/export\s+\{[^}]+\};?/g, '');

const rafCalls = [];
const drawSizes = [];
const notifications = [];

const ctxStub = {
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect: () => {},
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillText: () => {},
    setLineDash: () => {}
};

const canvasStub = { width: 0, height: 0, getContext: () => ctxStub };
function createClassList(initial = []) {
    const set = new Set(initial);
    return {
        add: (...classes) => classes.forEach(cls => set.add(cls)),
        remove: (...classes) => classes.forEach(cls => set.delete(cls)),
        contains: (cls) => set.has(cls),
        toggle: (cls, force) => {
            const next = typeof force === 'boolean' ? force : !set.has(cls);
            if (next) set.add(cls); else set.delete(cls);
            return next;
        }
    };
}

const genericElement = {
    style: {},
    textContent: '',
    addEventListener: () => {},
    onclick: null,
    dataset: {},
    appendChild: () => {},
    setAttribute: () => {},
    className: '',
    classList: createClassList(),
    querySelector: () => null
};

function createDocumentStub() {
    const listeners = {};
    const debugLogBody = { ...genericElement, classList: createClassList() };
    const debugLogInner = { ...genericElement, classList: createClassList(), addEventListener: () => {} };
    const debugLogClose = { ...genericElement };
    const debugStatus = { ...genericElement, hidden: true, classList: createClassList() };
    const debugStatusClose = { ...genericElement };
    const debugLog = {
        ...genericElement,
        classList: createClassList(),
        addEventListener: () => {},
        querySelector: (selector) => (selector === '.debug-log__inner' ? debugLogInner : null)
    };

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
            if (id === 'debug-log') return debugLog;
            if (id === 'debug-log-body') return debugLogBody;
            if (id === 'debug-log-close') return debugLogClose;
            if (id === 'debug-status') return debugStatus;
            if (id === 'debug-status-close') return debugStatusClose;
            if (id === 'audio-debug') return { ...genericElement };
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
    windowProxy.InputHelpers = { SQRT3: Math.sqrt(3), Layout: {}, isPointerOnDrawnHex: () => ({}) };
    return windowProxy;
}

function createImportStubs() {
    class TestHex {
        constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
        add(b) { return new TestHex(this.q + b.q, this.r + b.r, this.s + b.s); }
        toString() { return `${this.q},${this.r}`; }
        toPixel(layout = {}) {
            const origin = layout.origin || { x: 0, y: 0 };
            return { x: origin.x + this.q * 10, y: origin.y + this.r * 10 };
        }
        static neighbor(hex, dir = 0) {
            const dirs = [
                [1, -1, 0], [1, 0, -1], [0, 1, -1],
                [-1, 1, 0], [-1, 0, 1], [0, -1, 1]
            ];
            const offset = dirs[dir % 6];
            return new TestHex(hex.q + offset[0], hex.r + offset[1], hex.s + offset[2]);
        }
        static distance() { return 1; }
    }
    const testLayout = { f0: 1, f1: 1, f2: 0, f3: 1, b0: 1, b1: 1, b2: 0, b3: 1 };

    const persistenceSnapshot = {
        gold: 0,
        wood: 0,
        difficulty: 0,
        upgrades: { soldier: 1, archer: 1, production: 1, mines: 1, defense: 1 },
        research: { technologies: [], bonuses: { clusterBaseRate: 0.25 } },
        overworld: { hexes: new Map() },
        imperialFavor: 5,
        timekeeper: { ticks: 0, daysPerWeek: 7, weeksPerMonth: 4 },
        mandates: null,
        notifications: []
    };

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
        applyUIBindings: (game) => {
            game.bindVoidClickEasterEgg = () => {};
            game.setupInput = () => {};
            game.enqueueNotification = (note) => { notifications.push(note); return note.id || 'note'; };
            game.updateSaveStatus = () => {};
            game.showOverworldUI = () => {};
            game.updateHUD = () => {};
            game.updateUpgradeMenu = () => {};
            game.updateResearchUI = () => {};
            game.updateLeaderboardUI = () => {};
            game.updateSaveSlotsUI = () => {};
        },
        setupUIBindings: () => {},
        Timekeeper: class { onChange() {} tick() {} getDelta() { return 0; } reset() {} },
        OVERWORLD_TILES: {},
        drawOverworldTiles: (overworld) => { drawSizes.push(overworld.hexes.size); },
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
        updateTileAttackOverlay: () => {},
        validateBootstrapDependencies: ({ persistence }) => ({ persistenceAvailable: Boolean(persistence) }),
        resolveHexGrid: () => ({ Hex: TestHex, Layout: testLayout, SQRT3: Math.sqrt(3) }),
        resolveRenderConfig: () => ({ CAMERA_MOTION_CONFIG: { enabled: true }, AMBIENCE_CONFIG: { enabled: false } }),
        RenderConfig: { CAMERA_MOTION_CONFIG: { enabled: true }, AMBIENCE_CONFIG: { enabled: false } },
        HexGrid: { Hex: TestHex, Layout: testLayout, SQRT3: Math.sqrt(3) },
        AmbienceRenderer: class {},
        decorateTileMetadata: ({ hex, type }) => ({ hex, type, owner: 'player' }),
        describeAdjacencySummary: () => '',
        describeTileBonus: () => '',
        persistenceSnapshot
    };
}

const document = createDocumentStub();
const windowProxy = createWindowProxy(document);
const importStubs = createImportStubs();

const Persistence = {
    DEFAULT_STATS: { bestLevel: 0, bestKills: 0, totalKills: 0, warsFought: 0, lastOutcome: 'N/A', lastSaveISO: null },
    loadSnapshot: () => ({ state: { ...importStubs.persistenceSnapshot }, stats: { ...Persistence.DEFAULT_STATS }, slot: '1' })
};
windowProxy.Persistence = Persistence;

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
    ...importStubs,
    Persistence,
    ResearchSystem: { recordPurchase: () => {}, resolve: () => ({}) },
    require: () => ({})
});
context.globalThis = context;

new vm.Script(sanitizedSource, { filename: scriptPath }).runInContext(context);
context.bootstrapGame({ documentRef: document, windowRef: windowProxy });
(document.listeners['DOMContentLoaded'] || []).forEach(cb => cb());

assert.ok(rafCalls.length > 0, 'render loop should schedule a frame');
rafCalls[0](100);

assert.ok(drawSizes.length > 0, 'drawOverworldTiles should run at least once');
assert.ok(drawSizes[0] > 0, 'overworld should be repopulated before first draw');
assert.ok(notifications.some(note => note.id === 'overworld-recovery'), 'recovery should surface a user notification');

console.log('Overworld recovery bootstrap safety test passed.');
