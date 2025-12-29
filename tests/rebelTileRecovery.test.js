const assert = require('assert');
const { endWar } = require('../scripts/combatEngine.js');
const RebelSystem = require('../scripts/rebelSystem.js');
const ImperialMandatesBootstrap = require('../scripts/mandates/imperialMandates.js');
const ImperialMandates = ImperialMandatesBootstrap.initImperialMandates
    ? ImperialMandatesBootstrap.initImperialMandates(global)
    : ImperialMandatesBootstrap;

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
    assert.strictEqual(game.difficulty, game.stats.warsWon, 'difficulty should match wars won count');

    const restoredTile = game.overworld.hexes.get(targetKey);
    assert.ok(!RebelSystem.isRebelCampTile(restoredTile), 'victory should restore the rebel camp tile');

    const resolvedMandate = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp;
    assert.strictEqual(resolvedMandate.status, ImperialMandates.MandateStatus.SUCCEEDED, 'mandate should resolve to success');
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
            handleTileCleared: (clearedTile, gameState) => {
                clearedCalls.push({ clearedTile, gameState });
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
}

function run() {
    testRebelCampVictoryRestoresTerrain();
    testMandatedRebelCampVictoryUpdatesStatsAndMandate();
    testRebelCampRestoreRollsFromWeights();
    testRebelCampVictoryNotifiesMandates();
    console.log('Rebel tile recovery tests passed.');
}

run();
