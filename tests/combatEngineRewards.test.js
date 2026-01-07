import assert from 'assert';
import { damageBuilding, damageUnit, endWar, computeWarRewardMultiplier } from '../scripts/combatEngine.js';
import { RebelSystem, initRebelSystem } from '../scripts/rebelSystem.js';

class Hex {
    constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
    toString() { return `${this.q},${this.r}`; }
    equals(other) { return other && this.q === other.q && this.r === other.r; }
    static neighbor(hex, dir) {
        const dirs = [
            new Hex(1, 0, -1), new Hex(1, -1, 0), new Hex(0, -1, 1),
            new Hex(-1, 0, 1), new Hex(-1, 1, 0), new Hex(0, 1, -1)
        ];
        const delta = dirs[dir];
        return new Hex(hex.q + delta.q, hex.r + delta.r, hex.s + delta.s);
    }
}

function buildGame() {
    const hex = new Hex(0, 0);
    const game = {
        Hex,
        wood: 0,
        spawnTxt: (pos, text) => game.messages.push({ pos, text }),
        messages: [],
        parseKey: () => hex,
        combat: {
            territory: new Map([[hex.toString(), { owner: 'enemy', hex }]]),
            buildings: new Map([[hex.toString(), { type: 'tower', owner: 'enemy', hp: 5, pulse: 0 }]]),
            castles: { enemy: hex }
        }
    };
    return { game, hex };
}

function buildEndWarGame(startingGold = 100) {
    const hex = new Hex(0, 0);
    const game = {
        Hex,
        gold: startingGold,
        wood: 0,
        difficulty: 0,
        messages: [],
        floating: [],
        stats: { bestLevel: 0, bestKills: 0, warsWon: 0, warsFought: 0 },
        session: { warKills: 0 },
        research: { lives: 0 },
        pendingClearTileWasRebel: null,
        overworld: { hexes: new Map([[hex.toString(), { type: 'plain', owner: 'player', hex }]]) },
        combat: { territory: new Map(), buildings: new Map(), slots: new Map(), units: [], fx: [], castles: {} },
        timekeeper: { getCalendar: () => ({ month: 1 }) },
        spawnTxt: (pos, text) => game.messages.push({ pos, text }),
        showFloatingText: (x, y, text) => game.floating.push({ x, y, text }),
        updateHUD: () => { game.hudUpdated = true; },
        hideWarTip: () => {},
        armAmbientLoop: () => {},
        saveGame: () => {},
        updateLeaderboardUI: () => {},
        spawnParticleBurst: () => {},
        projectHexToScreen: () => ({ x: 0, y: 0 }),
        parseKey: (key) => {
            const [q, r] = key.split(',').map(Number);
            return new Hex(q, r);
        },
        calcOverworldGhosts: () => {},
        refreshClusterBonuses: () => {}
    };
    game.narrativeEvents = [];
    game.narrative = {
        emit: (eventType, payload) => {
            game.narrativeEvents.push({ eventType, payload });
        }
    };

    return { game, hex };
}

function createDomStub() {
    const stub = {
        classList: { add: () => {}, remove: () => {} },
        innerText: '',
        appendChild: () => {},
        body: { appendChild: () => {}, removeChild: () => {} },
        setAttribute: () => {},
        style: { setProperty: () => {} },
        remove: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 })
    };
    stub.createElement = () => ({
        classList: { add: () => {}, remove: () => {} },
        appendChild: () => {},
        setAttribute: () => {},
        addEventListener: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }),
        style: { setProperty: () => {} },
        remove: () => {},
        innerText: ''
    });
    return stub;
}

function withPatchedRandom(sequence, fn) {
    const original = Math.random;
    let index = 0;
    Math.random = () => {
        if (Array.isArray(sequence)) {
            const value = sequence[Math.min(index, sequence.length - 1)];
            index += 1;
            return value;
        }
        return sequence;
    };
    try {
        return fn();
    } finally {
        Math.random = original;
    }
}

function testPlayerMustLandFinalBlowForWood() {
    const { game } = buildGame('player');
    damageBuilding(game, '0,0', 10, 'player');
    assert.strictEqual(game.wood, 5, 'destroying enemy buildings should grant wood to the player');
    assert.ok(game.messages.find((m) => m.text === '+5w'), 'reward text should be emitted');
}

function testNonPlayerAttacksGiveNoReward() {
    const { game } = buildGame('enemy');
    damageBuilding(game, '0,0', 10, 'enemy');
    assert.strictEqual(game.wood, 0, 'AI crossfire should not reward the player');
    assert.ok(!game.messages.length, 'no reward messages should be emitted');
}

function testDeathSoundChanceGatesPlayback() {
    const playLog = [];
    const game = {
        spawnTxt: () => {},
        spawnBurstAtHex: () => {},
        updateLeaderboardUI: () => {},
        saveGame: () => {},
        playSound: (key) => playLog.push(key),
        stats: { totalKills: 0, bestKills: 0, bestLevel: 0, warsWon: 0, warsFought: 0 },
        session: { warKills: 0 },
        combat: { warElapsedMs: 0, ai: { gold: 0 } },
        gold: 0
    };

    const soldier = { type: 'soldier', hp: 1, pos: { q: 0, r: 0, s: 0 } };

    withPatchedRandom([0.99, 0.0], () => {
        damageUnit(game, soldier, 5, 'player');
    });

    assert.strictEqual(playLog.length, 0, 'high roll should suppress death sound playback');

    const soldierTwo = { type: 'soldier', hp: 1, pos: { q: 0, r: 0, s: 0 } };
    withPatchedRandom([0.0, 0.0], () => {
        damageUnit(game, soldierTwo, 5, 'player');
    });

    assert.ok(playLog.includes('death'), 'low roll should allow standard death sound playback');
}

function testDefeatAppliesGoldPenalty() {
    const originalWindow = global.window;
    const originalDocument = global.document;
    global.window = { innerWidth: 800, innerHeight: 600 };
    const domStub = createDomStub();
    global.document = { getElementById: () => domStub, createElement: domStub.createElement, body: domStub.body };

    const { game } = buildEndWarGame(100);
    const originalTimeout = global.setTimeout;
    global.setTimeout = () => 0;

    endWar(game, 'DEFEAT');

    assert.strictEqual(game.gold, 73, 'defeat should deduct the gold penalty and the royal levy');
    assert.ok(game.messages.find((m) => m.text.includes('pillaged')), 'penalty should be surfaced via spawnTxt');
    assert.ok(game.messages.find((m) => m.text.includes('royal levy')), 'levy should be surfaced via spawnTxt');
    assert.ok(game.floating.find((m) => m.text.includes('Lost 15g')), 'penalty should show in defeat HUD messaging');

    global.setTimeout = originalTimeout;
    global.window = originalWindow;
    global.document = originalDocument;
}

function testDefeatPenaltyCannotGoNegative() {
    const originalWindow = global.window;
    const originalDocument = global.document;
    global.window = { innerWidth: 800, innerHeight: 600 };
    const domStub = createDomStub();
    global.document = { getElementById: () => domStub, createElement: domStub.createElement, body: domStub.body };

    const { game } = buildEndWarGame(6);
    const originalTimeout = global.setTimeout;
    global.setTimeout = () => 0;

    endWar(game, 'DEFEAT');

    assert.strictEqual(game.gold, 0, 'defeat penalty should never drive gold negative');
    assert.ok(game.messages.find((m) => m.text.includes('-6g')), 'spawn text should reflect the clamped penalty');

    global.setTimeout = originalTimeout;
    global.window = originalWindow;
    global.document = originalDocument;
}

function testVictoryRaisesDifficultyByOne() {
    const originalWindow = global.window;
    const originalDocument = global.document;
    global.window = { innerWidth: 800, innerHeight: 600 };
    const domStub = createDomStub();
    global.document = { getElementById: () => domStub, createElement: domStub.createElement, body: domStub.body };

    const { game } = buildEndWarGame(120);
    const rebelHex = new Hex(0, 0);
    const rebelTile = { type: 'rebelcamp', owner: 'rebel', isRebelCamp: true, hex: rebelHex };
    game.overworld.hexes.set(rebelHex.toString(), rebelTile);
    game.pendingClearTile = { type: 'plain', owner: 'player', hex: rebelHex };
    game.pendingClearTileKey = rebelHex.toString();
    game.pendingClearTileWasRebel = true;
    const startingWins = game.stats.warsWon;
    endWar(game, 'VICTORY');

    assert.strictEqual(game.stats.warsWon, startingWins + 1, 'victory should increment wars won after clearing a rebel camp');
    assert.strictEqual(game.difficulty, game.stats.warsWon, 'enemy level should mirror wars won');

    global.window = originalWindow;
    global.document = originalDocument;
}

function testVictoryRestoresRebelCampWithStalePendingTile() {
    const originalWindow = global.window;
    const originalDocument = global.document;
    global.window = { innerWidth: 800, innerHeight: 600 };
    const domStub = createDomStub();
    global.document = { getElementById: () => domStub, createElement: domStub.createElement, body: domStub.body };

    const { game } = buildEndWarGame(120);
    const rebelHex = new Hex(2, -1);
    const rebelTile = { type: 'rebelcamp', owner: 'rebel', isRebelCamp: true, hex: rebelHex };
    game.overworld.hexes.set(rebelHex.toString(), rebelTile);
    game.pendingClearTile = { type: 'plain', owner: 'player', hex: rebelHex };
    game.pendingClearTileWasRebel = true;
    const startingWins = game.stats.warsWon;

    endWar(game, 'VICTORY');

    const updated = game.overworld.hexes.get(rebelHex.toString());
    assert.strictEqual(game.stats.warsWon, startingWins + 1, 'rebel victories should increment wars won');
    assert.strictEqual(game.difficulty, game.stats.warsWon, 'difficulty should mirror wars won after rebel victory');
    assert.ok(updated, 'overworld tile should exist after rebel restoration');
    assert.strictEqual(updated.owner, 'player', 'restored rebel tiles should return to player control');
    assert.notStrictEqual(updated.type, 'rebelcamp', 'restored rebel tiles should no longer be rebel camps');
    assert.ok(!updated.isRebelCamp, 'restored rebel tiles should clear rebel markers');

    global.window = originalWindow;
    global.document = originalDocument;
}

function testVictoryAppliesWarTax() {
    const originalWindow = global.window;
    const originalDocument = global.document;
    global.window = { innerWidth: 800, innerHeight: 600 };
    const domStub = createDomStub();
    global.document = { getElementById: () => domStub, createElement: domStub.createElement, body: domStub.body };

    const { game } = buildEndWarGame(100);
    endWar(game, 'VICTORY');

    assert.strictEqual(game.gold, 134, 'victory rewards should pay the 15% royal levy');
    assert.ok(game.messages.find((m) => m.text.includes('royal levy')), 'levy should be surfaced via spawnTxt on victory');

    global.window = originalWindow;
    global.document = originalDocument;
}

function testNarrativeEventsAfterVictory() {
    const originalWindow = global.window;
    const originalDocument = global.document;
    global.window = { innerWidth: 800, innerHeight: 600 };
    const domStub = createDomStub();
    global.document = { getElementById: () => domStub, createElement: domStub.createElement, body: domStub.body };

    const { game } = buildEndWarGame(100);
    const rebelHex = new Hex(0, 0);
    const rebelTile = { type: 'rebelcamp', owner: 'rebel', isRebelCamp: true, hex: rebelHex };
    game.overworld.hexes.set(rebelHex.toString(), rebelTile);
    game.pendingClearTile = { type: 'plain', owner: 'player', hex: rebelHex };
    game.pendingClearTileKey = rebelHex.toString();
    game.pendingClearTileWasRebel = true;
    game.combat.warElapsedMs = 9000;

    endWar(game, 'VICTORY');

    const outcome = game.narrativeEvents.find((event) => event.eventType === 'war_outcome');
    const tax = game.narrativeEvents.find((event) => event.eventType === 'war_tax_applied');
    const cleared = game.narrativeEvents.find((event) => event.eventType === 'rebel_camp_cleared');

    assert.ok(outcome, 'war outcome should emit a narrative event');
    assert.strictEqual(outcome.payload?.outcome, 'VICTORY', 'war outcome payload should include the result');
    assert.strictEqual(outcome.payload?.warElapsedMs, 9000, 'war outcome payload should include elapsed time');
    assert.ok(tax, 'war tax deductions should emit narrative events');
    assert.ok(cleared, 'cleared rebel camps should emit narrative events');
    assert.strictEqual(cleared.payload?.hexKey, rebelHex.toString(), 'rebel camp payload should include location');

    global.window = originalWindow;
    global.document = originalDocument;
}

function testVictoryUsesRebelStartFlagAfterRestoration() {
    const originalWindow = global.window;
    const originalDocument = global.document;
    global.window = { innerWidth: 800, innerHeight: 600 };
    const domStub = createDomStub();
    global.document = { getElementById: () => domStub, createElement: domStub.createElement, body: domStub.body };

    const { game } = buildEndWarGame(120);
    const rebelHex = new Hex(3, -2);
    const restoredTile = { type: 'forest', owner: 'player', hex: rebelHex };
    game.overworld.hexes.set(rebelHex.toString(), restoredTile);
    game.pendingClearTile = restoredTile;
    game.pendingClearTileKey = rebelHex.toString();
    game.pendingClearTileWasRebel = true;
    const startingWins = game.stats.warsWon;

    endWar(game, 'VICTORY');

    assert.strictEqual(
        game.stats.warsWon,
        startingWins + 1,
        'victory should honor the rebel-start flag even if the tile was already restored'
    );
    assert.strictEqual(game.difficulty, game.stats.warsWon, 'difficulty should mirror wars won after flagged rebel victory');

    global.window = originalWindow;
    global.document = originalDocument;
}

function testRewardMultiplierDecaysOverTime() {
    const startMultiplier = computeWarRewardMultiplier(0);
    const midMultiplier = computeWarRewardMultiplier(120000);
    const capMultiplier = computeWarRewardMultiplier(240000);

    assert.strictEqual(startMultiplier, 1, 'reward multiplier should start at 1.0');
    assert.ok(midMultiplier < startMultiplier, 'reward multiplier should decay as time elapses');
    assert.ok(midMultiplier > capMultiplier, 'reward multiplier should continue decaying toward the cap');
    assert.strictEqual(capMultiplier, 0, 'reward multiplier should hit 0 at the decay cap');
}

function testVictoryRewardsDecayWithElapsedWarTime() {
    const originalWindow = global.window;
    const originalDocument = global.document;
    global.window = { innerWidth: 800, innerHeight: 600 };
    const domStub = createDomStub();
    global.document = { getElementById: () => domStub, createElement: domStub.createElement, body: domStub.body };

    const { game: fastGame } = buildEndWarGame(100);
    fastGame.combat.warElapsedMs = 0;
    endWar(fastGame, 'VICTORY');

    const { game: lateGame } = buildEndWarGame(100);
    lateGame.combat.warElapsedMs = 240000;
    endWar(lateGame, 'VICTORY');

    assert.ok(
        lateGame.gold < fastGame.gold,
        'victory rewards should decrease as war time increases'
    );
    assert.strictEqual(lateGame.gold, 100, 'victory rewards should reach zero at the cap');
    assert.strictEqual(lateGame.wood, 0, 'wood rewards should reach zero at the cap');

    global.window = originalWindow;
    global.document = originalDocument;
}

function testVictoryRestoresRebelCampAfterLateInit(rebelSystem) {
    const originalWindow = global.window;
    const originalDocument = global.document;
    global.window = {
        innerWidth: 800,
        innerHeight: 600,
        ImperialMandates: {
            handleBattleOutcome: () => {},
            getProtectedOverworldKeys: () => new Set()
        }
    };
    const domStub = createDomStub();
    global.document = { getElementById: () => domStub, createElement: domStub.createElement, body: domStub.body };
    const rebelApi = rebelSystem.RebelSystem || rebelSystem;
    const originalRestore = rebelApi.restoreRebelTile;
    let restoreCalled = false;
    const restoreSpy = (tile, game) => {
        restoreCalled = true;
        const updated = { ...tile, type: 'plain', owner: 'player', isRebelCamp: false };
        game.overworld.hexes.set(updated.hex.toString(), updated);
        return updated;
    };
    rebelApi.restoreRebelTile = restoreSpy;

    rebelSystem.initRebelSystem(global.window);

    const { game } = buildEndWarGame(120);
    const rebelHex = new Hex(1, -1);
    const rebelTile = { type: 'rebelcamp', owner: 'rebel', isRebelCamp: true, hex: rebelHex };
    game.overworld.hexes.set(rebelHex.toString(), rebelTile);
    game.pendingClearTile = rebelTile;
    game.pendingClearTileKey = rebelHex.toString();
    game.pendingClearTileWasRebel = true;

    endWar(game, 'VICTORY');

    const updated = game.overworld.hexes.get(rebelHex.toString());
    assert.ok(restoreCalled, 'victory should restore the rebel camp even when RebelSystem initializes late');
    assert.ok(updated, 'overworld tile should exist after restoration');
    assert.strictEqual(updated.owner, 'player', 'restored rebel tiles should return to player control');
    assert.ok(!rebelApi.isRebelCampTile(updated), 'restored rebel tiles should no longer count as rebel camps');

    rebelApi.restoreRebelTile = originalRestore;
    global.window = originalWindow;
    global.document = originalDocument;
}

function run() {
    const originalWindow = global.window;
    const rebelSystemModule = { RebelSystem, initRebelSystem };
    testVictoryRestoresRebelCampAfterLateInit(rebelSystemModule);
    global.window = {
        ImperialMandates: {
            handleBattleOutcome: () => {},
            getProtectedOverworldKeys: () => new Set()
        },
        RebelSystem
    };
    testPlayerMustLandFinalBlowForWood();
    testNonPlayerAttacksGiveNoReward();
    testDeathSoundChanceGatesPlayback();
    testDefeatAppliesGoldPenalty();
    testDefeatPenaltyCannotGoNegative();
    testVictoryRaisesDifficultyByOne();
    testVictoryRestoresRebelCampWithStalePendingTile();
    testVictoryAppliesWarTax();
    testNarrativeEventsAfterVictory();
    testVictoryUsesRebelStartFlagAfterRestoration();
    testRewardMultiplierDecaysOverTime();
    testVictoryRewardsDecayWithElapsedWarTime();
    global.window = originalWindow;
    console.log('All combatEngine reward tests passed.');
}

run();
