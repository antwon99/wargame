import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ResearchSystem = require('../scripts/researchSystem.js');

const scriptPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'scripts', 'script.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');
const sanitizedSource = scriptSource
    .replace(/import[\s\S]*?from\s+['"][^'\"]+['"];\s*/g, '')
    .replace(/import\s+['"][^'\"]+['"];\s*/g, '')
    .replace(/Game\.init\(\);/g, '');

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
        dispatchEvent: (event) => {
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
    class TimekeeperStub {
        constructor({ startTick = 0 } = {}) {
            this.ticks = startTick;
            this.daysPerWeek = 7;
            this.weeksPerMonth = 4;
        }

        onChange() { return undefined; }
        reset(value = 0) { this.ticks = value; }
    }

    return {
        COMBAT_BUILDINGS: {},
        UNITS: {},
        TILE_VISIBILITY: { UNSEEN: 'unseen', SEEN: 'seen', VISIBLE: 'visible' },
        buildResearchStateSafe: ({ researchSystem, saved = {}, defaultClusterRate = 0 }) => ({
            technologies: researchSystem?.instantiateTechnologies?.(saved.technologies) || [],
            bonuses: { townGoldBonus: 0, forestWoodBonus: 0, clusterBaseRate: defaultClusterRate, landReclamationClusterBonus: 0 },
            lives: saved.lives || 0
        }),
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
        runAI: () => {},
        scorchEarth: () => {},
        spawnUnit: () => {},
        startWar: () => {},
        updateCombat: () => {},
        drawOverworldTiles: () => {},
        advanceOverworldTimer: () => {},
        applyUIBindings: () => {},
        setupUIBindings: () => {},
        validateBootstrapDependencies: () => ({ persistenceAvailable: true }),
        START_TICK: 0,
        Timekeeper: TimekeeperStub,
        buildClusterBonusMap: () => new Map(),
        DEFAULT_CLUSTER_RATE: 0.25,
        buildTileVisibilityMap: () => new Map(),
        resolveFogTileMask: () => ({}),
        FOG_VISUAL_CONFIG: {},
        FOG_VISUAL_MODES: {},
        resolveFogInnerOpacity: () => 1,
        resolveFogParallax: () => 1,
        resolveFogVisualConfig: () => ({})
    };
}

function loadGameModule() {
    const document = createDocumentStub();
    const windowStub = createWindowStub(document);
    const importStubs = createImportStubs();
    const fallbackStats = { bestLevel: 0, bestKills: 0, totalKills: 0, warsFought: 0, lastOutcome: 'N/A', lastSaveISO: null };
    windowStub.ResearchSystem = ResearchSystem;
    const persistenceStub = {
        DEFAULT_STATS: fallbackStats,
        loadSnapshot: () => ({ state: null, stats: { ...fallbackStats }, slot: '1' }),
        saveSnapshot: () => ({ slot: '1', savedAt: Date.now() })
    };
    windowStub.Persistence = persistenceStub;
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
        ResearchSystem,
        Persistence: persistenceStub,
        ...importStubs
    });
    context.globalThis = context;

    const script = new vm.Script(sanitizedSource, { filename: scriptPath });
    script.runInContext(context);
    const gameRef = context.Game || context.window?.Game;
    if (gameRef && typeof gameRef.bindVoidClickEasterEgg !== 'function') {
        gameRef.bindVoidClickEasterEgg = () => {};
    }
    (document.listeners['DOMContentLoaded'] || []).forEach(cb => cb());
    return { window: windowStub };
}

function testQueuedPlacementConsumesCharge() {
    const { window } = loadGameModule();
    const game = window.Game;

    const fieldHex = new game.Hex(0, 0, 0);
    const fieldTile = { hex: fieldHex, type: 'field', owner: 'player' };
    game.overworld.hexes = new Map([[fieldHex.toString(), fieldTile]]);
    game.overworld.claimable = new Map();
    game.gold = 2000;
    game.wood = 0;
    game.spawnTxt = () => {};
    game.showFloatingText = () => {};
    game.updateHUD = () => {};
    game.updateResearchUI = () => {};
    game.toggleResearch = () => {};
    game.research = game.buildResearchState();
    game.updateResearchBonuses();

    game.buyTechnology('land-reclamation', 'forest');
    assert.strictEqual(game.awaitingReclamationTarget, true, 'purchase should enter targeting state');
    assert.strictEqual(game.pendingReclamations.length, 1, 'purchase should queue a reclamation placement');

    const converted = game.applyQueuedReclamationToTile(fieldTile);
    assert.ok(converted, 'queued placement should apply to owned field tiles');
    assert.strictEqual(fieldTile.type, 'forest', 'tile type should match selected reclamation target');
    assert.strictEqual(game.pendingReclamations.length, 0, 'queue should be consumed after placement');
    assert.strictEqual(game.awaitingReclamationTarget, false, 'state should clear after placement');
}

function testClickValidationAndPrompt() {
    const document = createDocumentStub();
    const researchModal = createElementStub();
    document.getElementById('research-modal');
    document.getElementById = (id) => {
        if (id === 'research-modal') return researchModal;
        return createElementStub({ id });
    };
    const window = createWindowStub(document);
    const imports = createImportStubs();
    const fallbackStats = { bestLevel: 0, bestKills: 0, totalKills: 0, warsFought: 0, lastOutcome: 'N/A', lastSaveISO: null };
    const persistenceStub = {
        DEFAULT_STATS: fallbackStats,
        loadSnapshot: () => ({ state: null, stats: { ...fallbackStats }, slot: '1' }),
        saveSnapshot: () => ({ slot: '1', savedAt: Date.now() })
    };
    window.ResearchSystem = ResearchSystem;
    window.Persistence = persistenceStub;
    const context = vm.createContext({
        window,
        document,
        ...imports,
        ResearchSystem,
        Persistence: persistenceStub,
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        performance: { now: () => 0 }
    });
    context.globalThis = context;
    vm.runInContext(sanitizedSource, context);

    (window.document.listeners['DOMContentLoaded'] || []).forEach(cb => cb());
    const game = window.Game;

    const ownedHex = new game.Hex(0, 0, 0);
    const hostileHex = new game.Hex(1, 0, -1);
    const missingHex = new game.Hex(-2, 0, 2);
    const ownedTile = { hex: ownedHex, type: 'field', owner: 'player' };
    const hostileTile = { hex: hostileHex, type: 'field', owner: 'enemy' };
    game.overworld.hexes = new Map([
        [ownedHex.toString(), ownedTile],
        [hostileHex.toString(), hostileTile]
    ]);
    game.overworld.claimable = new Map();
    game.gold = 2000;
    game.wood = 0;

    let lastMessage = '';
    let researchCollapsed = false;
    game.spawnTxt = (_pos, msg) => { lastMessage = msg; };
    game.showFloatingText = () => {};
    game.updateHUD = () => {};
    game.updateResearchUI = () => {};
    game.toggleResearch = () => { researchCollapsed = true; };
    game.research = game.buildResearchState();
    game.updateResearchBonuses();

    game.buyTechnology('land-reclamation', 'town');
    assert.strictEqual(game.awaitingReclamationTarget, true, 'targeting state should activate');
    assert.ok(researchCollapsed, 'research modal should collapse on purchase');

    const layout = {
        origin: game.cam,
        size: 30 * game.cam.zoom,
        f0: Math.sqrt(3),
        f1: Math.sqrt(3) / 2,
        f2: 0,
        f3: 3 / 2,
        b0: Math.sqrt(3) / 3,
        b1: -1 / 3,
        b2: 0,
        b3: 2 / 3
    };
    const hostilePos = hostileHex.toPixel(layout);
    game.onClick(hostilePos.x, hostilePos.y);
    assert.strictEqual(lastMessage, 'Only player fields can be reclaimed', 'hostile tiles should be rejected');

    const missingPos = missingHex.toPixel(layout);
    game.onClick(missingPos.x, missingPos.y);
    assert.strictEqual(lastMessage, 'Select a valid field tile', 'missing tiles should show an error');

    const ownedPos = ownedHex.toPixel(layout);
    game.onClick(ownedPos.x, ownedPos.y);
    assert.strictEqual(game.awaitingReclamationTarget, false, 'successful placement clears targeting state');
}

function run() {
    testQueuedPlacementConsumesCharge();
    testClickValidationAndPrompt();
    console.log('Land reclamation flow tests passed.');
}

run();
