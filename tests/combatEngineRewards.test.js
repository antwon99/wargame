const assert = require('assert');
const { damageBuilding } = require('../scripts/combatEngine.js');

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

function run() {
    testPlayerMustLandFinalBlowForWood();
    testNonPlayerAttacksGiveNoReward();
    console.log('All combatEngine reward tests passed.');
}

run();
