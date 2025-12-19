const assert = require('assert');
const { damageBuilding, endWar } = require('../scripts/combatEngine.js');
const { createCombatUI } = require('../scripts/combat/ui.js');

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
        stats: { bestLevel: 0, bestKills: 0, warsFought: 0 },
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
    const { game } = buildEndWarGame(100);
    const ui = createCombatUI(game, {
        windowRef: { innerWidth: 800, innerHeight: 600 },
        documentRef: { getElementById: () => ({ classList: { add: () => {}, remove: () => {} }, innerText: '' }) },
        setTimeoutRef: (fn) => { fn(); return 0; }
    });

    endWar(game, 'DEFEAT', null, null, { ui });

    assert.strictEqual(game.gold, 73, 'defeat should deduct the gold penalty and the royal levy');
    assert.ok(game.messages.find((m) => m.text.includes('pillaged')), 'penalty should be surfaced via spawnTxt');
    assert.ok(game.messages.find((m) => m.text.includes('royal levy')), 'levy should be surfaced via spawnTxt');
    assert.ok(game.floating.find((m) => m.text.includes('Lost 15g')), 'penalty should show in defeat HUD messaging');
}

function testDefeatPenaltyCannotGoNegative() {
    const { game } = buildEndWarGame(6);
    const ui = createCombatUI(game, {
        windowRef: { innerWidth: 800, innerHeight: 600 },
        documentRef: { getElementById: () => ({ classList: { add: () => {}, remove: () => {} }, innerText: '' }) },
        setTimeoutRef: (fn) => { fn(); return 0; }
    });

    endWar(game, 'DEFEAT', null, null, { ui });

    assert.strictEqual(game.gold, 0, 'defeat penalty should never drive gold negative');
    assert.ok(game.messages.find((m) => m.text.includes('-6g')), 'spawn text should reflect the clamped penalty');
}

function testVictoryRaisesDifficultyByOne() {
    const { game } = buildEndWarGame(120);
    const ui = createCombatUI(game, {
        windowRef: { innerWidth: 800, innerHeight: 600 },
        documentRef: { getElementById: () => ({ classList: { add: () => {}, remove: () => {} }, innerText: '' }) },
        setTimeoutRef: (fn) => { fn(); return 0; }
    });

    const startingDifficulty = game.difficulty;
    endWar(game, 'VICTORY', null, null, { ui });

    assert.strictEqual(game.difficulty, startingDifficulty + 1, 'victory should advance enemy level by one');
}

function testVictoryAppliesWarTax() {
    const { game } = buildEndWarGame(100);
    const ui = createCombatUI(game, {
        windowRef: { innerWidth: 800, innerHeight: 600 },
        documentRef: { getElementById: () => ({ classList: { add: () => {}, remove: () => {} }, innerText: '' }) },
        setTimeoutRef: (fn) => { fn(); return 0; }
    });

    endWar(game, 'VICTORY', null, null, { ui });

    assert.strictEqual(game.gold, 134, 'victory rewards should pay the 15% royal levy');
    assert.ok(game.messages.find((m) => m.text.includes('royal levy')), 'levy should be surfaced via spawnTxt on victory');
}

function run() {
    testPlayerMustLandFinalBlowForWood();
    testNonPlayerAttacksGiveNoReward();
    testDefeatAppliesGoldPenalty();
    testDefeatPenaltyCannotGoNegative();
    testVictoryRaisesDifficultyByOne();
    testVictoryAppliesWarTax();
    console.log('All combatEngine reward tests passed.');
}

run();
