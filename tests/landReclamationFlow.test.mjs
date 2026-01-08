import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { ResearchSystem } from '../scripts/researchSystem.js';

ResearchSystem.initResearchSystem?.(globalThis);

const scriptPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'scripts', 'script.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');
const sanitizedSource = scriptSource
    .replace(/export\s+\{[\s\S]*?\}\s+from[^;]+;?/g, '')
    .replace(/import[\s\S]*?from\s+['"][^'\"]+['"];\s*/g, '')
    .replace(/import\s+['"][^'\"]+['"];\s*/g, '')
    .replace(/export\s+\{[\s\S]*?\};?/g, '')
    .replace(/^export.*$/gm, '')
    .replace(/Game\.init\(\);/g, '')
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

function createDocumentStub(overrides = {}) {
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

    return { ...document, ...overrides };
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

    return { ...windowStub, ...overrides };
}

function createImportStubs(overrides = {}) {
    class TimekeeperStub {
        constructor({ startTick = 0 } = {}) {
            this.ticks = startTick;
            this.daysPerWeek = 7;
            this.weeksPerMonth = 4;
        }

        onChange() { return undefined; }
        reset(value = 0) { this.ticks = value; }
    }

    const stubs = {
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
        resolveVisibilityMask: () => ({}),
        SNOW_VISUAL_CONFIG: {},
        resolveSnowSeason: () => ({ inSeason: true, progress: 0.5 }),
        resolveSnowVisualConfig: () => ({ enabled: true, coverage: 0.5 })
    };

    return { ...stubs, ...overrides };
}

async function loadGameModule({ importOverrides = {}, windowOverrides = {}, documentOverrides = {} } = {}) {
    const document = createDocumentStub(documentOverrides);
    const windowStub = createWindowStub(document, windowOverrides);
    const importStubs = createImportStubs(importOverrides);
    const fallbackStats = { bestLevel: 0, bestKills: 0, totalKills: 0, warsWon: 0, warsFought: 0, lastOutcome: 'N/A', lastSaveISO: null };
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

    if (!windowStub.Game) {
        global.window = windowStub;
        global.document = document;
        global.performance = global.performance || { now: () => 0 };
        global.requestAnimationFrame = windowStub.requestAnimationFrame;
        global.cancelAnimationFrame = windowStub.cancelAnimationFrame;
        const { createGameCore } = await import('../scripts/game/core.js');
        const { Game, Hex, Layout } = createGameCore({
            ...importOverrides,
            dependencies: {
                persistence: windowStub.Persistence ?? null,
                researchSystem: windowStub.ResearchSystem ?? null,
                inputHelpers: windowStub.InputHelpers ?? null
            }
        });
        windowStub.Game = Game;
        windowStub.Hex = Hex;
        windowStub.Layout = Layout;
        windowStub.Game.bindVoidClickEasterEgg = windowStub.Game.bindVoidClickEasterEgg || (() => {});
        windowStub.Game.updateSaveStatus = windowStub.Game.updateSaveStatus || (() => {});
        windowStub.Game.showOverworldUI = windowStub.Game.showOverworldUI || (() => {});
        windowStub.Game.updateUpgradeMenu = windowStub.Game.updateUpgradeMenu || (() => {});
        windowStub.Game.updateResearchUI = windowStub.Game.updateResearchUI || (() => {});
        windowStub.Game.updateLeaderboardUI = windowStub.Game.updateLeaderboardUI || (() => {});
        if (typeof windowStub.Game.init === 'function') {
            windowStub.Game.init({
                loadSnapshot: () => ({ state: null, stats: { ...fallbackStats }, slot: '1' }),
                onHUDUpdate: () => {},
                onSaveSlotsUpdate: () => {},
                onPostInit: () => {}
            });
            windowStub.Game.dependencyHealth = {
                ...(windowStub.Game.dependencyHealth || {}),
                persistenceAvailable: Boolean(windowStub.Persistence)
            };
        }
    }

    return { window: windowStub };
}

async function testQueuedPlacementConsumesCharge() {
    const { window } = await loadGameModule();
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
    assert.strictEqual(game.gold, 2000, 'gold should only be charged after a valid field selection');
    assert.strictEqual(game.awaitingReclamationTarget, true, 'purchase should enter targeting state');
    assert.strictEqual(game.pendingReclamations.length, 1, 'purchase should queue a reclamation placement');

    // Invalid attempts should keep the queue intact and retain the awaiting state.
    const invalidTile = { hex: new game.Hex(1, -1, 0), type: 'mountain', owner: null };
    assert.strictEqual(game.applyQueuedReclamationToTile(invalidTile), false, 'non-field tiles should be rejected');
    assert.strictEqual(game.pendingReclamations.length, 1, 'failed placement should leave the queued charge intact');
    assert.strictEqual(game.awaitingReclamationTarget, true, 'failed placement should retain awaiting state');
    assert.strictEqual(game.gold, 2000, 'invalid targets should not deduct gold');

    const converted = game.applyQueuedReclamationToTile(fieldTile);
    assert.ok(converted, 'queued placement should apply to owned field tiles');
    assert.strictEqual(fieldTile.type, 'forest', 'tile type should match selected reclamation target');
    assert.strictEqual(game.gold, 1500, 'conversion should charge the queued gold cost');
    assert.strictEqual(game.pendingReclamations.length, 0, 'queue should be consumed after placement');
    assert.strictEqual(game.awaitingReclamationTarget, false, 'state should clear after placement');
}

async function testClickValidationAndPrompt() {
    const { window } = await loadGameModule();
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
    assert.strictEqual(game.gold, 2000, 'gold should remain until a valid field is chosen');
    assert.strictEqual(game.awaitingReclamationTarget, true, 'targeting state should activate');
    assert.ok(researchCollapsed, 'research drawer should collapse on purchase');
    assert.strictEqual(game.pendingReclamations.length, 1, 'purchase should arm exactly one queued reclamation');

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
    assert.strictEqual(lastMessage, 'Enemy territory cannot be reclaimed', 'hostile tiles should be rejected');
    assert.strictEqual(game.pendingReclamations.length, 1, 'hostile click should not consume the queued charge');
    assert.strictEqual(game.gold, 2000, 'hostile tiles should not deduct queued gold');

    const missingPos = missingHex.toPixel(layout);
    game.onClick(missingPos.x, missingPos.y);
    assert.strictEqual(lastMessage, 'Select an owned FIELD to convert', 'missing tiles should show an error');
    assert.strictEqual(game.pendingReclamations.length, 1, 'missing tile should not consume the queued charge');
    assert.strictEqual(game.gold, 2000, 'invalid clicks should leave resources untouched');

    const ownedPos = ownedHex.toPixel(layout);
    game.onClick(ownedPos.x, ownedPos.y);
    assert.strictEqual(game.awaitingReclamationTarget, false, 'successful placement clears targeting state');
    assert.strictEqual(game.gold, 1500, 'valid placement should charge the queued cost');
}

async function testNoEligibleFieldsClearsPending() {
    const { window } = await loadGameModule();
    const game = window.Game;
    game.spawnTxt = () => {};
    game.showFloatingText = () => {};
    game.updateHUD = () => {};
    game.updateResearchUI = () => {};
    game.toggleResearch = () => {};
    game.research = game.buildResearchState();
    game.updateResearchBonuses();

    const viableHex = new game.Hex(0, 0, 0);
    const viableTile = { hex: viableHex, type: 'field', owner: 'player' };
    game.overworld.hexes = new Map([[viableHex.toString(), viableTile]]);
    game.overworld.claimable = new Map();
    game.gold = 2000;
    game.wood = 0;

    let feedback = '';
    game.spawnTxt = (_pos, msg) => { feedback = msg; };

    game.buyTechnology('land-reclamation', 'forest');
    assert.strictEqual(game.gold, 2000, 'purchasing the tech should not deduct gold until placement');
    assert.strictEqual(game.awaitingReclamationTarget, true, 'charge should arm awaiting state when purchased');

    // Simulate losing the only eligible tile between purchase and placement.
    game.overworld.hexes.clear();
    game.applyQueuedReclamationToTile(null, new game.Hex(0, 0, 0));

    assert.strictEqual(feedback, 'No player fields remain to reclaim', 'empty board should surface a reclamation warning');
    assert.strictEqual(game.awaitingReclamationTarget, false, 'missing fields should clear awaiting state');
    assert.strictEqual(game.pendingReclamations.length, 0, 'queue should reset when there is nothing to convert');
    assert.strictEqual(game.gold, 2000, 'failed placements should leave resources untouched');
}

async function testReclamationCostScalingRespectsPurchaseHistory() {
    const { window } = await loadGameModule();
    const game = window.Game;
    game.spawnTxt = () => {};
    game.showFloatingText = () => {};
    game.updateHUD = () => {};
    game.updateResearchUI = () => {};
    game.toggleResearch = () => {};
    game.research = game.buildResearchState();
    game.updateResearchBonuses();

    const firstField = new game.Hex(0, 0, 0);
    const secondField = new game.Hex(1, -1, 0);
    const thirdField = new game.Hex(2, -2, 0);
    game.overworld.hexes = new Map([
        [firstField.toString(), { hex: firstField, type: 'field', owner: 'player' }],
        [secondField.toString(), { hex: secondField, type: 'field', owner: 'player' }],
        [thirdField.toString(), { hex: thirdField, type: 'field', owner: 'player' }]
    ]);
    game.overworld.claimable = new Map();
    const startingGold = 2000;
    game.gold = startingGold;
    game.wood = 0;

    game.buyTechnology('land-reclamation', 'forest');
    assert.strictEqual(game.gold, startingGold, 'queued reclamations should defer payment until placement');
    assert.strictEqual(game.pendingReclamations.length, 1, 'first purchase should queue one placement');
    assert.strictEqual(game.pendingReclamations[0].cost.gold, 500, 'queued cost should reflect the base price');

    game.buyTechnology('land-reclamation', 'town');
    assert.strictEqual(game.gold, startingGold, 'queuing multiple conversions should not pre-charge gold');
    assert.strictEqual(game.pendingReclamations.length, 2, 'second purchase should queue an additional placement');
    assert.strictEqual(game.pendingReclamations[1].cost.gold, 500, 'town costs should not scale from forest purchases');

    game.buyTechnology('land-reclamation', 'forest');
    assert.strictEqual(game.pendingReclamations.length, 3, 'third purchase should queue another placement');
    assert.strictEqual(game.pendingReclamations[2].cost.gold, 675, 'forest costs should scale per forest purchase history');

    game.applyQueuedReclamationToTile(game.overworld.hexes.get(firstField.toString()));
    assert.strictEqual(game.gold, startingGold - 500, 'gold should deduct when the first placement lands');

    game.applyQueuedReclamationToTile(game.overworld.hexes.get(secondField.toString()));
    assert.strictEqual(game.gold, startingGold - 500 - 500, 'second placement should deduct the town cost');

    game.applyQueuedReclamationToTile(game.overworld.hexes.get(thirdField.toString()));
    assert.strictEqual(game.gold, startingGold - 500 - 500 - 675, 'third placement should deduct the scaled forest cost');
    assert.strictEqual(game.getTech('land-reclamation').timesPurchased, 3, 'purchases should register after successful placements');
}

async function testClusterBonusesRefreshAfterReclamation() {
    const bonusCalls = [];
    const buildClusterBonusMap = (hexes, params) => {
        const snapshot = Array.from(hexes.values()).map(tile => ({ key: tile.hex.toString(), type: tile.type }));
        bonusCalls.push({ params, snapshot });
        const result = new Map();
        snapshot.forEach(entry => result.set(entry.key, { rate: params.baseRate + params.reclamationRate, type: entry.type }));
        return result;
    };

    const { window } = await loadGameModule({ importOverrides: { buildClusterBonusMap } });
    const game = window.Game;
    game.spawnTxt = () => {};
    game.showFloatingText = () => {};
    game.updateHUD = () => {};
    game.updateResearchUI = () => {};
    game.toggleResearch = () => {};
    game.research = game.buildResearchState();
    game.updateResearchBonuses();
    bonusCalls.length = 0;

    const fieldHex = new game.Hex(0, 0, 0);
    const neighborHex = new game.Hex(0, 1, -1);
    const fieldTile = { hex: fieldHex, type: 'field', owner: 'player' };
    const neighborTile = { hex: neighborHex, type: 'town', owner: 'player' };
    game.overworld.hexes = new Map([
        [fieldHex.toString(), fieldTile],
        [neighborHex.toString(), neighborTile]
    ]);
    game.overworld.claimable = new Map();
    game.gold = 1000;
    game.wood = 0;

    game.buyTechnology('land-reclamation', 'forest');
    assert.strictEqual(bonusCalls.length, 0, 'cluster bonuses should refresh after a valid placement, not purchase');

    const converted = game.applyQueuedReclamationToTile(fieldTile);
    assert.ok(converted, 'reclamation should apply to player-owned fields');
    assert.ok(game.overworld.clusterBonuses instanceof Map, 'cluster bonus cache should be updated on conversion');
    assert.ok(bonusCalls.length >= 1, 'cluster bonuses should refresh when applying the conversion');

    const lastCall = bonusCalls[bonusCalls.length - 1];
    assert.strictEqual(lastCall.params.baseRate, 0.25, 'cluster recalculation should use the default base rate');
    assert.strictEqual(lastCall.params.reclamationRate, 0.05, 'cluster recalculation should include reclamation bonus rate');
    assert.deepStrictEqual(lastCall.snapshot.find(entry => entry.key === fieldHex.toString()).type, 'forest', 'cluster calc should observe updated tile types');
}

async function run() {
    await testQueuedPlacementConsumesCharge();
    await testClickValidationAndPrompt();
    await testNoEligibleFieldsClearsPending();
    await testReclamationCostScalingRespectsPurchaseHistory();
    await testClusterBonusesRefreshAfterReclamation();
    console.log('Land reclamation flow tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
