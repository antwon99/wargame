const assert = require('assert');
let damageBuilding;
let endWar;

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

    return { game, hex };
}

function createDomStub() {
    const stub = {
        classList: { add: () => {}, remove: () => {} },
        innerText: '',
        appendChild: () => {},
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

function testDefeatAppliesGoldPenalty() {
    const originalWindow = global.window;
    const originalDocument = global.document;
    global.window = { innerWidth: 800, innerHeight: 600 };
    const domStub = createDomStub();
    global.document = { getElementById: () => domStub, createElement: domStub.createElement };

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
    global.document = { getElementById: () => domStub, createElement: domStub.createElement };

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
    global.document = { getElementById: () => domStub, createElement: domStub.createElement };

    const { game } = buildEndWarGame(120);
    game.pendingClearTile = { type: 'rebelcamp', owner: 'rebel', isRebelCamp: true, hex: new Hex(0, 0) };
    const startingWins = game.stats.warsWon;
    endWar(game, 'VICTORY');

    assert.strictEqual(game.stats.warsWon, startingWins + 1, 'victory should increment wars won after clearing a rebel camp');
    assert.strictEqual(game.difficulty, game.stats.warsWon, 'enemy level should mirror wars won');

    global.window = originalWindow;
    global.document = originalDocument;
}

function testVictoryAppliesWarTax() {
    const originalWindow = global.window;
    const originalDocument = global.document;
    global.window = { innerWidth: 800, innerHeight: 600 };
    const domStub = createDomStub();
    global.document = { getElementById: () => domStub, createElement: domStub.createElement };

    const { game } = buildEndWarGame(100);
    endWar(game, 'VICTORY');

    assert.strictEqual(game.gold, 134, 'victory rewards should pay the 15% royal levy');
    assert.ok(game.messages.find((m) => m.text.includes('royal levy')), 'levy should be surfaced via spawnTxt on victory');

    global.window = originalWindow;
    global.document = originalDocument;
}

function run() {
    const originalWindow = global.window;
    global.window = {
        ImperialMandates: {
            handleBattleOutcome: () => {},
            getProtectedOverworldKeys: () => new Set()
        }
    };
    const modulePath = require.resolve('../scripts/combatEngine.js');
    delete require.cache[modulePath];
    ({ damageBuilding, endWar } = require('../scripts/combatEngine.js'));

    testPlayerMustLandFinalBlowForWood();
    testNonPlayerAttacksGiveNoReward();
    testDefeatAppliesGoldPenalty();
    testDefeatPenaltyCannotGoNegative();
    testVictoryRaisesDifficultyByOne();
    testVictoryAppliesWarTax();
    global.window = originalWindow;
    console.log('All combatEngine reward tests passed.');
}

run();
