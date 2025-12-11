import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

let lastClusterInputSize = 0;
let clusterBuilderCalled = false;

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
            add: (...names) => names.forEach((n) => classSet.add(n)),
            remove: (...names) => names.forEach((n) => classSet.delete(n)),
            contains: (name) => classSet.has(name),
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
        getElementById: (id) => {
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
        dispatchEvent: (event) => {
            const callbacks = listeners[event] || [];
            callbacks.forEach((cb) => cb());
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
    const baseStubs = {
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
        buildClusterBonusMap: (hexes) => {
            const bonuses = new Map();
            clusterBuilderCalled = true;
            const isMapLike = hexes && typeof hexes.get === 'function' && typeof hexes.forEach === 'function';
            if (isMapLike) {
                lastClusterInputSize = hexes.size || 0;
                hexes.forEach((tile, key) => bonuses.set(key, { owner: tile?.owner }));
            }
            return bonuses;
        },
        DEFAULT_CLUSTER_RATE: 0.25,
        buildTileVisibilityMap: () => new Map(),
        resolveFogTileMask: () => ({}),
        buildResearchStateSafe: () => ({ technologies: [], bonuses: { clusterBaseRate: 0.25 } }),
        START_TICK: 0,
        FOG_VISUAL_CONFIG: {},
        FOG_VISUAL_MODES: { STANDARD: 'standard' },
        resolveFogInnerOpacity: () => 1,
        resolveFogParallax: () => 1,
        resolveFogVisualConfig: () => ({}),
        normalizeOverworldHexKey: (hexOrTile) => {
            const hex = hexOrTile?.hex ?? hexOrTile;
            if (!Number.isFinite(hex?.q) || !Number.isFinite(hex?.r)) return null;
            return `${hex.q},${hex.r}`;
        },
        validateBootstrapDependencies: ({ persistence }) => ({ persistenceAvailable: Boolean(persistence) })
    };

    return { ...baseStubs, ...overrides };
}

async function loadGameModule({ globals = {}, importOverrides = {} } = {}) {
    clusterBuilderCalled = false;
    lastClusterInputSize = 0;
    const document = createDocumentStub();
    const { console: consoleOverride, ...windowGlobals } = globals;
    const windowStub = createWindowStub(document, windowGlobals);
    const importStubs = createImportStubs(importOverrides);
    const consoleStub = consoleOverride || console;
    windowStub.console = consoleStub;

    const context = vm.createContext({
        console: consoleStub,
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

    (document.listeners['DOMContentLoaded'] || []).forEach((cb) => cb());

    return { window: windowStub, context };
}

async function testBootstrapNormalizesStarterTiles() {
    const { window, context } = await loadGameModule();

    context.buildClusterBonusMap = (hexes) => {
        clusterBuilderCalled = true;
        const bonuses = new Map();
        const isMapLike = hexes && typeof hexes.get === 'function' && typeof hexes.forEach === 'function';
        if (isMapLike) {
            lastClusterInputSize = hexes.size || 0;
            hexes.forEach((tile, key) => bonuses.set(key, { owner: tile?.owner }));
        }
        return bonuses;
    };
    context.DEFAULT_CLUSTER_RATE = 0.25;
    clusterBuilderCalled = false;
    lastClusterInputSize = 0;

    const game = window.Game;
    game.bootstrapNewWorld();
    game.refreshClusterBonuses();

    const tiles = Array.from(game.overworld.hexes.values());
    const missingHex = tiles.filter((tile) => !(tile.hex instanceof game.Hex));
    assert.strictEqual(game.overworld.hexes.size, 7, 'Bootstrap should seed the castle and six neighbors.');
    assert.strictEqual(clusterBuilderCalled, true, 'Cluster bonus helper should run during bootstrap.');
    assert.strictEqual(lastClusterInputSize, 7, 'Cluster bonus builder should receive normalized starter tiles.');
    const clusterSize = game.overworld.clusterBonuses?.size ?? 0;
    assert.strictEqual(missingHex.length, 0, 'Starter tiles should retain valid Hex instances.');
    assert.strictEqual(
        clusterSize,
        game.overworld.hexes.size,
        'Cluster bonuses should be keyed by normalized starter coordinates.'
    );
}

async function testAddOverworldHexRejectsInvalidCoords() {
    const { window } = await loadGameModule();
    const game = window.Game;

    const startingSize = game.overworld.hexes.size;
    game.addOverworldHex(null, 'castle');
    assert.strictEqual(
        game.overworld.hexes.size,
        startingSize,
        'Should ignore attempts to add tiles without a valid hex payload.'
    );
}

async function testSpawnClusterLogCapturesStarterRing() {
    const capturedLogs = [];
    const debugConsole = { ...console, debug: (...args) => capturedLogs.push(args) };
    const { window } = await loadGameModule({ globals: { console: debugConsole } });
    const game = window.Game;

    game.featureToggles.debug = { ...game.featureToggles.debug, logAdjacency: true };
    assert.strictEqual(game.overworld.hexes.size, 7, 'Castle and starter ring should be seeded before debug logging.');
    capturedLogs.length = 0;
    const clusterMap = game.refreshClusterBonuses();
    assert.strictEqual(clusterMap.size, 7, 'Spawn cluster map should include the castle and six neighbors.');

    assert.ok(capturedLogs.length > 0, 'Spawn cluster helper should emit a log when the debug toggle is enabled.');
    const [label, snapshot] = capturedLogs[capturedLogs.length - 1];
    assert.strictEqual(label, 'Spawn cluster adjacency snapshot', 'Log label should describe the spawn cluster snapshot.');
    assert.ok(Array.isArray(snapshot), 'Snapshot payload should be an array of normalized cluster entries.');
    const loggedKeys = snapshot.map((entry) => entry?.key).filter(Boolean);
    const sortedKeys = [...loggedKeys].sort();
    const expectedKeys = ['-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0'].sort();
    assert.deepStrictEqual(sortedKeys, expectedKeys, 'Castle and six neighbors should be present in the spawn cluster log.');
    const missingEntries = snapshot.filter((entry) => entry?.clusterState !== 'cluster');
    assert.strictEqual(missingEntries.length, 0, 'Spawn cluster entries should expose live cluster states for QA.');
}

async function run() {
    await testBootstrapNormalizesStarterTiles();
    await testAddOverworldHexRejectsInvalidCoords();
    await testSpawnClusterLogCapturesStarterRing();
    console.log('Bootstrap integrity tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
