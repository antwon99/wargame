import assert from 'assert';
import { endWar } from '../scripts/combatEngine.js';
import { resolveEnemyLevel } from '../scripts/utils/resolveEnemyLevel.js';
import { OVERWORLD_RESTORE_WEIGHTS, OVERWORLD_TERRAIN_WEIGHTS } from '../scripts/overworldConfig.js';
import { RebelSystem } from '../scripts/rebelSystem.js';
import { initImperialMandates } from '../scripts/mandates/imperialMandates.js';

const ImperialMandates = initImperialMandates(globalThis);

class Hex {
    constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
    toString() { return `${this.q},${this.r}`; }
    static neighbor(hex, dir) {
        const dirs = [
            new Hex(1, 0, -1), new Hex(1, -1, 0), new Hex(0, -1, 1),
            new Hex(-1, 0, 1), new Hex(-1, 1, 0), new Hex(0, 1, -1)
        ];
        return new Hex(hex.q + dirs[dir].q, hex.r + dirs[dir].r, hex.s + dirs[dir].s);
    }
}

function createElement() {
    const classes = new Set();
    return {
        style: {},
        classList: {
            add: (...names) => names.forEach((n) => classes.add(n)),
            remove: (...names) => names.forEach((n) => classes.delete(n))
        },
        set innerText(value) { this._innerText = value; },
        get innerText() { return this._innerText; }
    };
}

function buildGame() {
    const overworld = { hexes: new Map(), claimable: new Map() };
    const game = {
        Hex,
        overworld,
        research: { lives: 0 },
        difficulty: 0,
        gold: 0,
        wood: 0,
        stats: { totalKills: 0, bestKills: 0, bestLevel: 0, warsWon: 0, warsFought: 0 },
        session: { warKills: 0 },
        cam: { x: 0, y: 0, zoom: 1 },
        viewport: { width: 800, height: 600 },
        hideWarTip: () => null,
        updateHUD: () => null,
        armAmbientLoop: () => null,
        calcOverworldGhosts: () => null,
        refreshClusterBonuses: () => null,
        spawnTxt: () => null,
        showFloatingText: () => null,
        updateLeaderboardUI: () => null,
        saveGame: () => null,
        combat: { particles: [] }
    };
    return game;
}

function seedOverworld(game) {
    const addTile = (hex) => game.overworld.hexes.set(hex.toString(), { hex, type: 'field' });
    addTile(new Hex(0, 0));
    addTile(new Hex(1, 0));
    addTile(new Hex(0, 1));
    addTile(new Hex(1, 1));
    addTile(new Hex(-1, 0));
}

function withPatchedRandom(sequence, fn) {
    const original = Math.random;
    let idx = 0;
    Math.random = () => {
        const value = sequence[Math.min(idx, sequence.length - 1)];
        idx += 1;
        return value;
    };
    try { fn(); } finally { Math.random = original; }
}

function withUiShell(fn) {
    const originalWindow = global.window;
    const originalDocument = global.document;
    const uiOverworld = createElement();
    const uiCombat = createElement();
    const stateTxt = createElement();
    global.window = { innerWidth: 1024, innerHeight: 768, exitCombat: () => null };
    global.document = {
        createElement,
        getElementById: (id) => {
            if (id === 'ui-overworld') return uiOverworld;
            if (id === 'ui-combat') return uiCombat;
            if (id === 'state-txt') return stateTxt;
            return null;
        },
        body: createElement()
    };
    try { fn(); } finally { global.window = originalWindow; global.document = originalDocument; }
}

function withMandateStubs(stubs, fn) {
    const overrides = stubs || {};
    const originalHandleOutcome = ImperialMandates.handleBattleOutcome;
    const originalHandleTileCleared = ImperialMandates.handleTileCleared;
    const originalProtectedKeys = ImperialMandates.getProtectedOverworldKeys;
    ImperialMandates.handleBattleOutcome = overrides.handleBattleOutcome || (() => null);
    ImperialMandates.handleTileCleared = overrides.handleTileCleared || (() => null);
    ImperialMandates.getProtectedOverworldKeys = () => new Set();
    try { fn(); } finally {
        ImperialMandates.handleBattleOutcome = originalHandleOutcome;
        ImperialMandates.handleTileCleared = originalHandleTileCleared;
        ImperialMandates.getProtectedOverworldKeys = originalProtectedKeys;
    }
}

function withRebelRestoreStub(stub, fn) {
    const originalRestore = RebelSystem.restoreRebelTile;
    RebelSystem.restoreRebelTile = stub;
    try { fn(); } finally { RebelSystem.restoreRebelTile = originalRestore; }
}

function withGlobalRebelSystem(stub, fn) {
    const originalRebelSystem = global.RebelSystem;
    global.RebelSystem = stub;
    try { fn(); } finally {
        if (typeof originalRebelSystem === 'undefined') delete global.RebelSystem;
        else global.RebelSystem = originalRebelSystem;
    }
}

function testRebelCampVictoryRestoresTerrain() {
    const game = buildGame();
    const hex = new Hex(0, 0);
    const tile = { hex, type: 'rebelcamp', owner: 'rebel', isRebelCamp: true, prevType: 'field' };
    game.overworld.hexes.set(hex.toString(), tile);
    game.pendingClearTile = tile;
    game.pendingClearTileKey = hex.toString();
    game.state = 'COMBAT';
    let refreshCalls = 0;
    game.refreshClusterBonuses = () => {
        refreshCalls += 1;
    };

    withUiShell(() => {
        withMandateStubs(null, () => {
            withPatchedRandom([0.0], () => {
                endWar(game, 'VICTORY');
            });
        });
    });

    const updated = game.overworld.hexes.get(hex.toString());
    assert.notStrictEqual(updated, tile, 'restored tiles should be written back to overworld hexes');
    assert.strictEqual(updated.owner, 'player', 'victory should restore rebel camps to player control');
    assert.strictEqual(updated.type, 'field', 'victory should roll a new terrain type');
    assert.ok(!updated.isRebelCamp, 'rebel camp flags should clear after victory');
    assert.ok(!updated.prevType, 'rebel metadata should be removed after conversion');
    assert.strictEqual(refreshCalls, 1, 'refreshClusterBonuses should run after rebel restoration');
}

function testMandatedRebelCampVictoryUpdatesStatsAndMandate() {
    ImperialMandates.resetForNewCampaign();
    const game = buildGame();
    seedOverworld(game);

    ImperialMandates.issuePendingMandates(game, {
        enqueueNotification: () => null,
        showTileCallout: (tile, gameState, options) => {
            if (typeof options?.onConfirm === 'function') options.onConfirm();
        },
        hideTileCallout: () => null
    });

    const mandateState = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp;
    const targetKey = mandateState.metadata.targetTileKey;
    assert.ok(targetKey, 'mandate should track the rebel camp tile');
    const rebelTile = game.overworld.hexes.get(targetKey);
    assert.ok(RebelSystem.isRebelCampTile(rebelTile), 'targeted tile should be a rebel camp');

    game.pendingClearTile = rebelTile;
    game.pendingClearTileKey = targetKey;
    game.pendingClearTileWasRebel = true;
    game.state = 'COMBAT';

    withUiShell(() => {
        withPatchedRandom([0.0], () => {
            endWar(game, 'VICTORY');
        });
    });

    assert.strictEqual(game.stats.warsWon, 1, 'victory should increment wars won');
    assert.strictEqual(resolveEnemyLevel(game), game.stats.warsWon + 1, 'enemy level should stay one ahead of wars won');

    const restoredTile = game.overworld.hexes.get(targetKey);
    assert.ok(!RebelSystem.isRebelCampTile(restoredTile), 'victory should restore the rebel camp tile');

    const resolvedMandate = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp;
    assert.strictEqual(resolvedMandate.status, ImperialMandates.MandateStatus.SUCCEEDED, 'mandate should resolve to success');
}

function testMandatedRebelCampVictoryRestoresTileAndOverlay() {
    ImperialMandates.resetForNewCampaign();
    const game = buildGame();
    seedOverworld(game);

    ImperialMandates.issuePendingMandates(game, {
        enqueueNotification: () => null,
        showTileCallout: (tile, gameState, options) => {
            if (typeof options?.onConfirm === 'function') options.onConfirm();
        },
        hideTileCallout: () => null
    });

    const mandateState = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp;
    const targetKey = mandateState.metadata.targetTileKey;
    const rebelTile = game.overworld.hexes.get(targetKey);

    game.pendingClearTile = rebelTile;
    game.pendingClearTileKey = targetKey;
    game.pendingClearTileWasRebel = true;
    game.state = 'COMBAT';

    const originalRestore = RebelSystem.restoreRebelTile;
    let restoreCalls = 0;

    withUiShell(() => {
        withRebelRestoreStub((tileArg, gameState) => {
            restoreCalls += 1;
            return originalRestore(tileArg, gameState, { rng: () => 0 });
        }, () => {
            withPatchedRandom([0.0], () => {
                endWar(game, 'VICTORY');
            });
        });
    });

    assert.strictEqual(restoreCalls, 1, 'victory should restore the rebel camp tile');
    const restoredTile = game.overworld.hexes.get(targetKey);
    assert.ok(!RebelSystem.isRebelCampTile(restoredTile), 'rebel camp victory should clear the attack overlay state');

    const resolvedMandate = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp;
    assert.strictEqual(resolvedMandate.status, ImperialMandates.MandateStatus.SUCCEEDED, 'mandate should resolve to success');
}

function testRebelCampVictoryRestoresWhenFlagCleared() {
    const game = buildGame();
    const hex = new Hex(3, 0);
    const tile = { hex, type: 'field', owner: 'player' };
    game.overworld.hexes.set(hex.toString(), tile);
    game.pendingClearTile = tile;
    game.pendingClearTileKey = hex.toString();
    game.pendingClearTileWasRebel = true;
    game.state = 'COMBAT';
    let refreshCalls = 0;
    game.refreshClusterBonuses = () => {
        refreshCalls += 1;
    };
    const clearedCalls = [];
    let restoreArgs;

    withUiShell(() => {
        withMandateStubs({
            handleTileCleared: (clearedTile, gameState) => {
                clearedCalls.push({ clearedTile, gameState });
            }
        }, () => {
            withRebelRestoreStub((tileArg, gameState) => {
                restoreArgs = { tileArg, gameState };
                return { ...tileArg, restored: true };
            }, () => {
                withPatchedRandom([0.0], () => {
                    endWar(game, 'VICTORY');
                });
            });
        });
    });

    assert.ok(restoreArgs, 'victory should attempt rebel restoration when flagged as rebel war');
    assert.strictEqual(restoreArgs.tileArg, tile, 'restore should receive the resolved target tile');
    assert.strictEqual(restoreArgs.gameState, game, 'restore should receive the live game state');
    assert.strictEqual(refreshCalls, 1, 'refreshClusterBonuses should run after restoration');
    assert.strictEqual(clearedCalls.length, 1, 'handleTileCleared should fire after restoration');
    assert.strictEqual(clearedCalls[0].clearedTile?.restored, true, 'restored tile should be forwarded to mandates');
}

function testRebelCampRestoreRollsFromWeights() {
    const game = buildGame();
    const hex = new Hex(1, 1);
    const tile = { hex, type: 'rebelcamp', owner: 'rebel', isRebelCamp: true };
    game.overworld.hexes.set(hex.toString(), tile);

    const updated = RebelSystem.restoreRebelTile(tile, game, { rng: () => 0.999 });

    assert.strictEqual(updated.type, 'water', 'restored rebel tiles should use weighted terrain rolls');
    assert.strictEqual(updated.isWater, true, 'water rolls should mark tiles as water for rendering');
}

function testRebelCampRestoreFiltersRebelCampWeight() {
    const originalRestoreWeights = OVERWORLD_RESTORE_WEIGHTS.slice();
    const originalSpawnWeights = OVERWORLD_TERRAIN_WEIGHTS.slice();
    OVERWORLD_RESTORE_WEIGHTS.length = 0;
    OVERWORLD_RESTORE_WEIGHTS.push({ type: 'field', weight: 1 });
    OVERWORLD_TERRAIN_WEIGHTS.length = 0;
    OVERWORLD_TERRAIN_WEIGHTS.push(
        { type: 'rebelcamp', weight: 100 },
        { type: 'water', weight: 1 }
    );

    try {
        const game = buildGame();
        const hex = new Hex(2, 1);
        const tile = { hex, type: 'rebelcamp', owner: 'rebel', isRebelCamp: true };
        game.overworld.hexes.set(hex.toString(), tile);

        const updated = RebelSystem.restoreRebelTile(tile, game, { rng: () => 0.0 });

        assert.strictEqual(updated.type, 'field', 'restored rebel tiles should never return rebel camps');
    } finally {
        OVERWORLD_RESTORE_WEIGHTS.length = 0;
        OVERWORLD_RESTORE_WEIGHTS.push(...originalRestoreWeights);
        OVERWORLD_TERRAIN_WEIGHTS.length = 0;
        OVERWORLD_TERRAIN_WEIGHTS.push(...originalSpawnWeights);
    }
}

function testRebelCampRestoreRefreshesSelection() {
    const game = buildGame();
    const hex = new Hex(4, 1);
    const tile = { hex, type: 'rebelcamp', owner: 'rebel', isRebelCamp: true };
    game.overworld.hexes.set(hex.toString(), tile);
    game.pendingClearTile = tile;
    game.pendingClearTileKey = hex.toString();
    game.selectedOverworldTile = tile;
    game.state = 'COMBAT';
    const selectionUpdates = [];
    game.setSelectedOverworldTile = (selection) => {
        selectionUpdates.push(selection);
        game.selectedOverworldTile = selection;
    };

    withUiShell(() => {
        withMandateStubs(null, () => {
            withRebelRestoreStub((tileArg) => ({ ...tileArg, type: 'field', owner: 'player' }), () => {
                withPatchedRandom([0.0], () => {
                    endWar(game, 'VICTORY');
                });
            });
        });
    });

    assert.strictEqual(selectionUpdates.length, 1, 'restored rebel tiles should refresh the selection');
    assert.strictEqual(game.selectedOverworldTile?.type, 'field', 'selection should reflect restored terrain state');
    assert.strictEqual(game.selectedOverworldTile?.owner, 'player', 'selection should reflect restored ownership');
}

function testRebelCampVictoryNotifiesMandates() {
    const game = buildGame();
    const hex = new Hex(2, 2);
    const tile = { hex, type: 'rebelcamp', owner: 'rebel', isRebelCamp: true };
    game.overworld.hexes.set(hex.toString(), tile);
    game.pendingClearTile = tile;
    game.pendingClearTileKey = hex.toString();
    game.state = 'COMBAT';
    const clearedCalls = [];

    withUiShell(() => {
        withMandateStubs({
            handleTileCleared: (clearedTile, gameState, uiBindings, explicitTileKey) => {
                clearedCalls.push({ clearedTile, gameState, explicitTileKey });
            }
        }, () => {
            withPatchedRandom([0.0], () => {
                endWar(game, 'VICTORY');
            });
        });
    });

    assert.strictEqual(clearedCalls.length, 1, 'victory should notify mandates when a rebel camp is restored');
    assert.strictEqual(clearedCalls[0].clearedTile?.hex?.toString(), hex.toString(), 'tile cleared event should include a stable key');
    assert.strictEqual(clearedCalls[0].gameState, game, 'tile cleared event should forward the live game state');
    assert.strictEqual(clearedCalls[0].explicitTileKey, hex.toString(), 'tile cleared event should pass the pending tile key');
}

function testEndWarUsesImportedRebelSystem() {
    const game = buildGame();
    const hex = new Hex(5, 0);
    const tile = { hex, type: 'field', owner: 'player' };
    game.overworld.hexes.set(hex.toString(), tile);
    game.pendingClearTile = tile;
    game.pendingClearTileKey = hex.toString();
    game.state = 'COMBAT';

    const originalIsRebel = RebelSystem.isRebelCampTile;
    const originalRestore = RebelSystem.restoreRebelTile;
    RebelSystem.isRebelCampTile = () => false;
    RebelSystem.restoreRebelTile = () => {
        throw new Error('Module rebel system should be stubbed in test');
    };

    let isRebelCalls = 0;
    let restoreCalls = 0;
    let globalCalls = 0;

    withUiShell(() => {
        withMandateStubs(null, () => {
            withGlobalRebelSystem({
                isRebelCampTile: (tileArg) => {
                    globalCalls += 1;
                    return tileArg === tile;
                },
                restoreRebelTile: (tileArg, gameState) => {
                    globalCalls += 1;
                    const updated = { ...tileArg, restoredFromGlobal: true };
                    gameState.overworld.hexes.set(tileArg.hex.toString(), updated);
                    return updated;
                }
            }, () => {
                withPatchedRandom([0.0], () => {
                    RebelSystem.isRebelCampTile = (tileArg) => {
                        isRebelCalls += 1;
                        return tileArg === tile;
                    };
                    RebelSystem.restoreRebelTile = (tileArg, gameState) => {
                        restoreCalls += 1;
                        const updated = { ...tileArg, restoredFromImport: true };
                        gameState.overworld.hexes.set(tileArg.hex.toString(), updated);
                        return updated;
                    };
                    endWar(game, 'VICTORY');
                });
            });
        });
    });

    RebelSystem.isRebelCampTile = originalIsRebel;
    RebelSystem.restoreRebelTile = originalRestore;

    assert.strictEqual(isRebelCalls, 1, 'endWar should resolve rebel camps from the imported rebel system');
    assert.strictEqual(restoreCalls, 1, 'endWar should restore rebel tiles using the imported rebel system');
    assert.strictEqual(globalCalls, 0, 'endWar should ignore the global rebel system');
    const updated = game.overworld.hexes.get(hex.toString());
    assert.ok(updated.restoredFromImport, 'restored tile should come from the imported rebel system');
}

function run() {
    testRebelCampVictoryRestoresTerrain();
    testMandatedRebelCampVictoryUpdatesStatsAndMandate();
    testMandatedRebelCampVictoryRestoresTileAndOverlay();
    testRebelCampVictoryRestoresWhenFlagCleared();
    testRebelCampRestoreRollsFromWeights();
    testRebelCampRestoreFiltersRebelCampWeight();
    testRebelCampRestoreRefreshesSelection();
    testRebelCampVictoryNotifiesMandates();
    testEndWarUsesImportedRebelSystem();
    console.log('Rebel tile recovery tests passed.');
}

run();
