const assert = require('assert');
const { buyBuilding, isFrontier, runAI } = require('../scripts/combatEngine.js');

class TestHex {
    constructor(q, r, s = -q - r) {
        this.q = q;
        this.r = r;
        this.s = s;
    }

    add(other) { return new TestHex(this.q + other.q, this.r + other.r, this.s + other.s); }
    equals(other) { return this.q === other.q && this.r === other.r && this.s === other.s; }
    toString() { return `${this.q},${this.r}`; }

    static round(h) { return new TestHex(Math.round(h.q), Math.round(h.r), Math.round(h.s)); }
    static distance(a, b) { return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2; }
    static neighbor(hex, dir) {
        const dirs = [
            new TestHex(1, 0, -1), new TestHex(1, -1, 0), new TestHex(0, -1, 1),
            new TestHex(-1, 0, 1), new TestHex(-1, 1, 0), new TestHex(0, 1, -1)
        ];
        return hex.add(dirs[dir]);
    }
}

function buildBorderGame() {
    const playerCastle = new TestHex(0, -5, 5);
    const enemyCastle = new TestHex(0, 5, -5);
    const playerFrontier = new TestHex(0, 0, 0);
    const enemyFrontier = new TestHex(1, 0, -1);

    const territory = new Map();
    territory.set(playerCastle.toString(), { owner: 'player', hex: playerCastle });
    territory.set(enemyCastle.toString(), { owner: 'enemy', hex: enemyCastle });
    territory.set(playerFrontier.toString(), { owner: 'player', hex: playerFrontier });
    territory.set(enemyFrontier.toString(), { owner: 'enemy', hex: enemyFrontier });

    const parseKey = (key) => {
        const [q, r] = key.split(',').map((v) => parseInt(v, 10));
        return new TestHex(q, r, -q - r);
    };

    return {
        Hex: TestHex,
        parseKey,
        spawnTxt: () => {},
        spawnBurstAtHex: () => {},
        updateLeaderboardUI: () => {},
        saveGame: () => {},
        hideWarTip: () => {},
        showFloatingText: () => {},
        document: {},
        playSound: () => {},
        gold: 200,
        combat: {
            territory,
            slots: new Map([[enemyFrontier.toString(), 'barracks']]),
            buildings: new Map(),
            castles: { player: playerCastle, enemy: enemyCastle },
            ai: { gold: 200, timer: 0, nextMove: 0 }
        }
    };
}

function testSharedBorderEnablesPurchasing() {
    const game = buildBorderGame();
    const playerFrontKey = game.parseKey('0,0').toString();
    const enemyFrontKey = game.parseKey('1,0').toString();

    assert.ok(isFrontier(game, playerFrontKey, 'player', TestHex), 'Player border tile should be considered frontier when touching enemy territory');
    assert.ok(isFrontier(game, enemyFrontKey, 'enemy', TestHex), 'Enemy border tile should be considered frontier when touching player territory');

    buyBuilding(game, game.parseKey(playerFrontKey), 'barracks');
    const playerStructure = game.combat.buildings.get(playerFrontKey);
    assert.strictEqual(playerStructure?.owner, 'player', 'Player should be able to purchase on contested border');

    runAI(game);
    const enemyStructure = game.combat.buildings.get(enemyFrontKey);
    assert.strictEqual(enemyStructure?.owner, 'enemy', 'Enemy should be able to purchase on contested border');
}

function run() {
    testSharedBorderEnablesPurchasing();
    console.log('Frontier purchasing adjacency tests passed.');
}

run();
