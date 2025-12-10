import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { DEFAULT_CLUSTER_RATE } from '../scripts/overworldAdjacency.js';
import { OVERWORLD_TILES } from '../scripts/overworldConfig.js';

const scriptPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'scripts', 'script.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');
const sanitizedSource = scriptSource
    .replace(/import[\s\S]*?from\s+['"][^'\"]+['"];\s*/g, '')
    .replace(/import\s+['"][^'\"]+['"];\s*/g, '');

function buildDeterministicClusterBonusMap(hexes = new Map(), options = {}) {
    const bonuses = new Map();
    const baseRate = typeof options.baseRate === 'number' ? options.baseRate : DEFAULT_CLUSTER_RATE;
    const clusterSize = Math.max(1, hexes.size);
    const adjacencyRate = Math.max(0, clusterSize - 1) * baseRate;

    hexes.forEach((tile, key) => {
        const woodBonus = tile?.type === 'forest' ? Math.max(1, Math.floor(adjacencyRate)) : 0;
        const goldBonus = tile?.type === 'town' ? Math.max(1, Math.floor(adjacencyRate)) : 0;
        bonuses.set(key, {
            type: tile?.type,
            owner: tile?.owner,
            size: clusterSize,
            adjacencyRate,
            reclamationRate: 0,
            totalRate: adjacencyRate,
            goldBonus,
            woodBonus
        });
    });

    return bonuses;
}

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
            constructor() { this.listeners = []; }
            onChange(cb) { this.listeners.push(cb); }
            tick() {}
            getDelta() { return 0; }
            reset() {}
        },
        OVERWORLD_TILES,
        drawOverworldTiles: () => {},
        advanceOverworldTimer: () => ({}),
        buildClusterBonusMap: buildDeterministicClusterBonusMap,
        DEFAULT_CLUSTER_RATE,
        buildTileVisibilityMap: () => new Map(),
        resolveFogTileMask: () => ({}),
        buildResearchStateSafe: () => ({ technologies: [], bonuses: { clusterBaseRate: DEFAULT_CLUSTER_RATE } }),
        START_TICK: 0,
        FOG_VISUAL_CONFIG: {},
        FOG_VISUAL_MODES: {},
        resolveFogInnerOpacity: () => 1,
        resolveFogParallax: () => 1,
        resolveFogVisualConfig: () => ({}),
        validateBootstrapDependencies: ({ persistence }) => ({ persistenceAvailable: Boolean(persistence) })
    };
}

async function loadGameModule({ globals = {}, randomSequence = [] } = {}) {
    const document = createDocumentStub();
    const windowStub = createWindowStub(document, globals);
    const importStubs = createImportStubs();
    let randomIndex = 0;
    const deterministicRandom = () => {
        if (randomIndex < randomSequence.length) return randomSequence[randomIndex++];
        if (randomSequence.length) return randomSequence[randomSequence.length - 1];
        return Math.random();
    };
    const mathProxy = new Proxy(Math, {
        get(target, prop) {
            if (prop === 'random') return deterministicRandom;
            return Reflect.get(target, prop);
        }
    });

    const context = vm.createContext({
        console,
        Math: mathProxy,
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

    return { window: windowStub, document };
}

async function testBootstrapRefreshesAdjacencyCache() {
    const { window, document } = await loadGameModule({ randomSequence: Array(6).fill(0.6) });
    const game = window.Game;

    const originalFinalize = game.finalizeStarterTerritory.bind(game);
    let sawPrepopulatedCluster = false;
    game.finalizeStarterTerritory = function wrappedFinalize() {
        sawPrepopulatedCluster = this.overworld.clusterBonuses instanceof Map
            && this.overworld.clusterBonuses.size > 0;
        return originalFinalize();
    };

    game.bootstrapNewWorld();

    assert.ok(sawPrepopulatedCluster, 'cluster bonuses should populate before finalizing starter territory');

    global.document = document;
    global.window = window;
    const { updateTileInspector } = await import('../scripts/uiBindings.js');

    const forestTile = [...game.overworld.hexes.values()].find(tile => tile.type === 'forest');
    assert.ok(forestTile, 'starter ring should include at least one forest when random is stubbed');
    const forestKey = forestTile.hex.toString();
    const forestCluster = game.overworld.clusterBonuses.get(forestKey);
    assert.ok(forestCluster && forestCluster.size >= 2, 'starter forest should register adjacency in the cache');

    updateTileInspector(game, forestTile);
    const summary = document.getElementById('tile-inspector-adjacency-summary');
    assert.ok(summary.innerText.toLowerCase().includes('cluster'), 'inspector should surface cluster bonuses for starter forest');
}

async function run() {
    await testBootstrapRefreshesAdjacencyCache();
    console.log('Bootstrap cluster bonus test passed.');
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
