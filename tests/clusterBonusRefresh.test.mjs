import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const scriptPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'scripts', 'script.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');
const sanitizedSource = scriptSource
    .replace(/import[\s\S]*?from\s+['"][^'\"]+['"];\s*/g, '')
    .replace(/import\s+['"][^'\"]+['"];\s*/g, '');

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

function createImportStubs(overrides = {}) {
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
        FOG_VISUAL_MODES: {},
        resolveFogInnerOpacity: () => 1,
        resolveFogParallax: () => 1,
        resolveFogVisualConfig: () => ({}),
        validateBootstrapDependencies: ({ persistence }) => ({ persistenceAvailable: Boolean(persistence) }),
        ...overrides
    };
}

function loadGameModule({ importOverrides = {}, windowOverrides = {} } = {}) {
    const document = createDocumentStub();
    const windowStub = createWindowStub(document, windowOverrides);
    const importStubs = createImportStubs(importOverrides);

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

    return { window: windowStub };
}

function testStarterClaimsRefreshClusterCache() {
    const clusterCalls = [];
    const buildClusterBonusMap = (hexes) => {
        const snapshot = Array.from(hexes?.entries() || []).map(([key, tile]) => ({ key, type: tile?.type }));
        clusterCalls.push({ size: hexes?.size || 0, snapshot });
        return new Map(snapshot.map(entry => [entry.key, entry]));
    };

    const { window } = loadGameModule({ importOverrides: { buildClusterBonusMap } });
    const game = window.Game;

    assert.ok(game, 'game instance should be initialized after bootstrap');

    // Ignore bootstrap refreshes to focus on new claims made within the test.
    clusterCalls.length = 0;
    game.overworld.hexes = new Map([[new game.Hex(0, 0).toString(), { hex: new game.Hex(0, 0), type: 'castle', owner: 'player' }]]);
    game.overworld.claimable = new Map();
    game.spawnTxt = () => {};

    game.claimHexLogic(new game.Hex(1, 0, -1), true);

    assert.ok(clusterCalls.length >= 1, 'free claims should rebuild the cluster bonus map');
    const lastCall = clusterCalls[clusterCalls.length - 1];
    assert.strictEqual(lastCall.size, 2, 'cluster calculation should include the newly claimed starter tile');
}

function testPaidClaimsStillRefreshClusterCache() {
    const clusterCalls = [];
    const buildClusterBonusMap = (hexes) => {
        clusterCalls.push({ size: hexes?.size || 0 });
        return new Map(Array.from(hexes?.keys() || []).map(key => [key, { key }]));
    };

    const { window } = loadGameModule({ importOverrides: { buildClusterBonusMap } });
    const game = window.Game;

    clusterCalls.length = 0;
    game.overworld.hexes = new Map([[new game.Hex(0, 0).toString(), { hex: new game.Hex(0, 0), type: 'castle', owner: 'player' }]]);
    game.overworld.claimable = new Map();
    game.spawnTxt = () => {};

    game.claimHexLogic(new game.Hex(1, -1, 0), false);

    assert.ok(clusterCalls.length >= 1, 'paid claims should continue to refresh the cluster cache');
    assert.strictEqual(clusterCalls[clusterCalls.length - 1].size, 2, 'cluster cache should reflect the paid claim tile count');
}

function run() {
    testStarterClaimsRefreshClusterCache();
    testPaidClaimsStillRefreshClusterCache();
    console.log('Cluster bonus refresh tests passed.');
}

run();
