import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const scriptPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'scripts', 'script.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');
const sanitizedSource = scriptSource
    .replace(/import[\s\S]*?from\s+['"][^'\"]+['"];\s*/g, '')
    .replace(/import\s+['"][^'\"]+['"];\s*/g, '');

function createRecordingContext() {
    const operations = [];
    const gradientFactory = () => ({ stops: [], addColorStop(pos, color) { this.stops.push({ pos, color }); } });
    const ctx = {
        operations,
        fillStyle: '#000',
        strokeStyle: '#000',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        beginPath: () => operations.push('begin'),
        moveTo: (x, y) => operations.push(['move', x, y]),
        lineTo: (x, y) => operations.push(['line', x, y]),
        closePath: () => operations.push('close'),
        save: () => operations.push('save'),
        restore: () => operations.push('restore'),
        fill: () => operations.push({ type: 'fill', style: ctx.fillStyle, alpha: ctx.globalAlpha, composite: ctx.globalCompositeOperation }),
        stroke: () => operations.push('stroke'),
        clearRect: () => operations.push('clear'),
        fillRect: () => operations.push('fillRect'),
        createRadialGradient: () => {
            const gradient = gradientFactory();
            operations.push('gradient');
            return gradient;
        },
        arc: (x, y, r) => operations.push({ type: 'arc', x, y, r }),
        fillText: (text, x, y) => operations.push({ type: 'text', text, x, y, alpha: ctx.globalAlpha }),
        measureText: () => ({ width: 0 })
    };

    return ctx;
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
        getContext: () => createRecordingContext(),
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

function createDocumentStub(canvasElement) {
    const elements = new Map(canvasElement ? [['canvas', canvasElement]] : []);
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
    const defaultFogConfig = {
        enabled: true,
        ambienceEnabled: true,
        ambienceLayersEnabled: true,
        baseFillOnlyWhenAmbienceDisabled: true,
        legacyBackdropEnabled: false,
        gradientEnabled: false,
        rippleEnabled: false,
        rippleOpacity: 0.5,
        clusterGlowEnabled: false,
        fogGradientStops: {},
        rippleGradientStops: {},
        spotlightColors: {},
        voidFill: '#0b0b11',
        parallaxAmplitude: 0,
        parallaxSpeed: 0,
        coreInnerOpacity: 1
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
        OVERWORLD_TILES: [],
        drawOverworldTiles: () => {},
        advanceOverworldTimer: () => ({}),
        buildClusterBonusMap: () => new Map(),
        DEFAULT_CLUSTER_RATE: 0.25,
        buildTileVisibilityMap: ({ overworld, claimable, combat, state = 'OVERWORLD' } = {}) => {
            const visibility = new Map();
            const promote = (key, level) => {
                const current = visibility.get(key) || 'unseen';
                const rank = { unseen: 0, seen: 1, visible: 2 };
                if (rank[level] > rank[current]) visibility.set(key, level);
            };

            overworld?.forEach?.((_, key) => promote(key, 'visible'));
            claimable?.forEach?.((_, key) => promote(key, 'seen'));

            if (state === 'COMBAT') {
                combat?.forEach?.((tile, key) => {
                    const owner = (tile?.owner || '').toLowerCase();
                    promote(key, owner === 'player' ? 'visible' : 'seen');
                });
            }

            return visibility;
        },
        resolveFogTileMask: () => ({}),
        buildResearchStateSafe: () => ({ technologies: [], bonuses: { clusterBaseRate: 0.25 } }),
        attachFogParallaxDebugControls: () => {},
        FOG_VISUAL_CONFIG: defaultFogConfig,
        resolveFogInnerOpacity: () => 1,
        resolveFogParallax: (cfg = {}) => ({
            parallaxSpeed: cfg.parallaxSpeed ?? defaultFogConfig.parallaxSpeed,
            parallaxAmplitude: cfg.parallaxAmplitude ?? defaultFogConfig.parallaxAmplitude
        }),
        resolveFogVisualConfig: (cfg = {}) => ({ ...defaultFogConfig, ...cfg }),
        SeasonalSnowfallController: class {
            constructor() {
                this.profile = {
                    intensity: 0,
                    targetIntensity: 0,
                    noiseFloor: 0,
                    driftMultiplier: 1,
                    densityMultiplier: 1,
                    scaleMultiplier: 1,
                    whiteness: 1,
                    opacityFloor: 0
                };
            }
            update() { return this.profile; }
            attachDebugControls() {}
        },
        validateBootstrapDependencies: ({ persistence }) => ({ persistenceAvailable: Boolean(persistence) })
    };
}

async function loadGameModule() {
    const recordingContext = createRecordingContext();
    const canvasElement = createElementStub({ getContext: () => recordingContext });
    const document = createDocumentStub(canvasElement);
    const windowStub = createWindowStub(document);
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

    return { window: windowStub, context, recordingContext };
}

async function testTileFogMasks() {
    const { window, context, recordingContext } = await loadGameModule();
    const { Game, Hex } = window;
    const { Layout, TILE_VISIBILITY } = context;
    const mapCtor = vm.runInContext('Map', context);

    const layout = { origin: { x: 0, y: 0 }, size: 20, ...Layout };
    Game.cam = { zoom: 1, x: 0, y: 0 };
    Game.ctx = recordingContext;
    Game.viewport = { width: 200, height: 200 };
    Game.fog = { visibility: new mapCtor(), hexLayout: layout };

    recordingContext.operations.length = 0;
    const seenHex = new Hex(0, 0);
    Game.drawTileFog(seenHex, { hex: seenHex }, TILE_VISIBILITY.SEEN);
    const seenFills = recordingContext.operations.filter(op => op.type === 'fill');
    assert.strictEqual(seenFills.length, 2, 'seen tiles should layer dim and desaturation passes');
    assert.ok(seenFills.some(op => op.alpha < 1), 'seen tiles should render with reduced opacity');

    recordingContext.operations.length = 0;
    const unseenHex = new Hex(1, 0);
    Game.drawTileFog(unseenHex, { hex: unseenHex }, TILE_VISIBILITY.UNSEEN);
    const unseenFills = recordingContext.operations.filter(op => op.type === 'fill');
    assert.strictEqual(unseenFills.length, 1, 'unseen tiles should draw a single opaque mask');
}

async function testFogBackdropFallsBackToVoidFillWhenAmbienceDisabled() {
    const { window, context, recordingContext } = await loadGameModule();
    const { Game, Hex } = window;
    const { Layout, TILE_VISIBILITY } = context;

    const layout = { origin: { x: 0, y: 0 }, size: 20, ...Layout };
    Game.cam = { zoom: 1, x: 0, y: 0 };
    Game.ctx = recordingContext;
    Game.viewport = { width: 200, height: 200 };
    Game.state = 'OVERWORLD';
    Game.overworld = { hexes: new Map([['0,0', { hex: new Hex(0, 0), owner: 'player' }]]), claimable: new Map() };
    Game.combat = { territory: new Map() };
    Game.fog = { time: 0 };

    Game.featureToggles.fog.ambienceEnabled = false;
    Game.featureToggles.fog.baseFillOnlyWhenAmbienceDisabled = true;

    recordingContext.operations.length = 0;
    Game.renderFogBackdrop(layout);

    const gradients = recordingContext.operations.filter(op => op === 'gradient');
    const fills = recordingContext.operations.filter(op => op === 'fillRect');

    assert.strictEqual(gradients.length, 0, 'ambience-off fog should skip gradient-based layers');
    assert.ok(fills.length >= 1, 'ambience-off fog should still paint the void backdrop');
    assert.strictEqual(
        Game.fog.visibility.get('0,0'),
        TILE_VISIBILITY.VISIBLE,
        'tile visibility should resolve even when ambience visuals are disabled'
    );
}

async function testCombatVisibilityFiltering() {
    const { window, context, recordingContext } = await loadGameModule();
    const { Game, Hex } = window;
    const { Layout, TILE_VISIBILITY, UNITS, COMBAT_BUILDINGS } = context;
    const mapCtor = vm.runInContext('Map', context);

    UNITS.soldier = { char: 'S' };
    COMBAT_BUILDINGS.tower = { char: 'T' };
    COMBAT_BUILDINGS.TOWER = COMBAT_BUILDINGS.tower;

    const layout = { origin: { x: 0, y: 0 }, size: 24, ...Layout };
    Game.cam = { zoom: 1, x: 0, y: 0 };
    Game.ctx = recordingContext;
    Game.viewport = { width: 200, height: 200 };
    Game.fog = { visibility: new mapCtor([
        ['0,0', TILE_VISIBILITY.VISIBLE],
        ['1,0', TILE_VISIBILITY.SEEN],
        ['2,0', TILE_VISIBILITY.UNSEEN]
    ]) };

    Game.combat = {
        territory: new Map([
            ['0,0', { hex: new Hex(0, 0), owner: 'player' }],
            ['1,0', { hex: new Hex(1, 0), owner: 'enemy' }],
            ['2,0', { hex: new Hex(2, 0), owner: 'enemy' }]
        ]),
        slots: new Map(),
        buildings: new Map([
            ['1,0', { type: 'tower', owner: 'enemy', pulse: 0 }],
            ['2,0', { type: 'tower', owner: 'enemy', pulse: 0 }]
        ]),
        units: [
            { type: 'soldier', owner: 'enemy', pos: new Hex(1, 0), pulse: 0 },
            { type: 'soldier', owner: 'enemy', pos: new Hex(2, 0), pulse: 0 }
        ],
        fx: []
    };

    assert.strictEqual(Game.resolveHexVisibility(new Hex(2, 0)), TILE_VISIBILITY.UNSEEN, 'visibility map should mark unseen tiles');

    recordingContext.operations.length = 0;
    Game.drawCombat(layout);

    const unitFills = recordingContext.operations.filter(op => op.type === 'fill' && op.alpha === 0.55);
    const arcs = recordingContext.operations.filter(op => op.type === 'arc');
    const towerLabels = recordingContext.operations.filter(op => op.type === 'text' && op.text === 'T');

    assert.strictEqual(arcs.length, 1, 'units on unseen tiles should not render');
    assert.ok(unitFills.length >= 1, 'seen-but-not-visible units should render with reduced opacity');
    assert.strictEqual(towerLabels.length, 1, 'buildings on unseen tiles should be skipped');
}

async function run() {
    await testTileFogMasks();
    await testFogBackdropFallsBackToVoidFillWhenAmbienceDisabled();
    await testCombatVisibilityFiltering();
    console.log('Fog rendering tests passed.');
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
