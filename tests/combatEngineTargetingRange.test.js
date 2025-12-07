const assert = require('assert');
const { UNITS, updateCombat } = require('../scripts/combatEngine.js');

class TestHex {
    constructor(q, r, s = -q - r) {
        this.q = q;
        this.r = r;
        this.s = s;
    }

    add(other) { return new TestHex(this.q + other.q, this.r + other.r, this.s + other.s); }
    toString() { return `${this.q},${this.r}`; }

    static round(h) {
        return new TestHex(Math.round(h.q), Math.round(h.r), Math.round(h.s ?? (-h.q - h.r)));
    }

    static distance(a, b) {
        return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
    }
}

function buildGame() {
    const parseKey = (key) => {
        const [q, r] = key.split(',').map((v) => parseInt(v, 10));
        return new TestHex(q, r, -q - r);
    };

    const archer = {
        owner: 'player',
        type: 'archer',
        pos: new TestHex(0, 0, 0),
        speed: 0,
        range: UNITS.archer.range,
        dmg: UNITS.archer.dmg,
        cooldown: 0,
        hp: UNITS.archer.hp
    };
    const soldier = {
        owner: 'enemy',
        type: 'soldier',
        pos: new TestHex(3, 0, -3),
        speed: 0,
        range: UNITS.soldier.range,
        dmg: UNITS.soldier.dmg,
        cooldown: 0,
        hp: 100
    };

    const barracks = { owner: 'enemy', type: 'barracks', hp: 500, prodTimer: 0, attackTimer: 0 };

    return {
        Hex: TestHex,
        parseKey,
        spawnTxt: () => {},
        spawnBurstAtHex: () => {},
        updateLeaderboardUI: () => {},
        saveGame: () => {},
        updateHUD: () => {},
        playSound: () => {},
        gold: 0,
        stats: { totalKills: 0, bestKills: 0, bestLevel: 0, warsFought: 0 },
        session: { warKills: 0 },
        combat: {
            units: [archer, soldier],
            buildings: new Map([['2,0', barracks]]),
            territory: new Map(),
            slots: new Map(),
            ai: { timer: 0, nextMove: Infinity, gold: 0 },
            castles: { player: null, enemy: null },
            fx: []
        }
    };
}

function testRangedUnitsPreferEnemiesWithinRange() {
    const game = buildGame();
    const soldier = game.combat.units.find((u) => u.type === 'soldier');
    const barracks = game.combat.buildings.get('2,0');

    updateCombat(game, 1, TestHex);

    assert.ok(soldier.hp < 100, 'Archer should damage the enemy soldier when it is within range');
    assert.strictEqual(barracks.hp, 500, 'Barracks should not be targeted when an enemy unit is in range');
}

function run() {
    testRangedUnitsPreferEnemiesWithinRange();
    console.log('Combat engine targeting range tests passed.');
}

run();
