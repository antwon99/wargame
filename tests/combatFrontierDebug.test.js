const assert = require('assert');
const { debugCombatFrontier } = require('../scripts/combatEngine.js');

class StubHex {
    constructor(q, r, s = -q - r) {
        this.q = q;
        this.r = r;
        this.s = s;
    }

    add(other) { return new StubHex(this.q + other.q, this.r + other.r, this.s + other.s); }
    equals(other) { return this.q === other.q && this.r === other.r && this.s === other.s; }
    toString() { return `${this.q},${this.r}`; }

    static round(h) { return new StubHex(Math.round(h.q), Math.round(h.r), Math.round(h.s)); }
    static distance(a, b) { return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2; }
    static neighbor(hex, dir) {
        const dirs = [
            new StubHex(1, 0, -1), new StubHex(1, -1, 0), new StubHex(0, -1, 1),
            new StubHex(-1, 0, 1), new StubHex(-1, 1, 0), new StubHex(0, 1, -1)
        ];
        return hex.add(dirs[dir]);
    }
}

function buildGame(flags = {}) {
    const castle = new StubHex(0, 0, 0);
    const frontier = new StubHex(1, 0, -1);
    const enemy = new StubHex(2, 0, -2);

    const territory = new Map([
        [castle.toString(), { owner: 'player', hex: castle }],
        [frontier.toString(), { owner: 'player', hex: frontier }],
        [enemy.toString(), { owner: 'enemy', hex: enemy }]
    ]);

    return {
        game: {
            Hex: StubHex,
            parseKey: (key) => {
                const [q, r] = key.split(',').map((v) => parseInt(v, 10));
                return new StubHex(q, r, -q - r);
            },
            combat: {
                territory,
                slots: new Map([[frontier.toString(), 'barracks']]),
                buildings: new Map([[castle.toString(), { owner: 'player', type: 'castle' }]]),
                units: [],
                fx: [],
                debug: {},
                ai: {},
                castles: { player: castle, enemy: null }
            },
            featureToggles: { debug: { logCombatFrontier: Boolean(flags.logFlag) } }
        },
        frontierKey: frontier.toString(),
        enemyKey: enemy.toString()
    };
}

function testSkipsWithoutDebugFlag() {
    const { game } = buildGame({ logFlag: false });
    const snapshot = debugCombatFrontier(game, { logOutput: false });
    assert.deepStrictEqual(snapshot, [], 'probe should be guarded when debug flag is false');
}

function testLogsSnapshotOncePerWar() {
    const { game, frontierKey, enemyKey } = buildGame({ logFlag: true });

    const first = debugCombatFrontier(game, { logOutput: false, oncePerWar: true });
    assert.ok(first.length >= 2, 'snapshot should include combat tiles');

    const frontierTile = first.find((entry) => entry.key === frontierKey);
    assert.ok(frontierTile, 'frontier tile should be present');
    assert.strictEqual(frontierTile.owner, 'player');
    assert.strictEqual(frontierTile.isFrontier, true, 'player frontier should resolve via isFrontier');
    assert.strictEqual(frontierTile.canBePurchased, true, 'frontier tile with slot should be purchasable');

    const enemyTile = first.find((entry) => entry.key === enemyKey);
    assert.ok(enemyTile, 'enemy tile should be present');
    assert.strictEqual(enemyTile.isFrontier, false, 'enemy territory should not be treated as player frontier');

    const second = debugCombatFrontier(game, { logOutput: false, oncePerWar: true });
    assert.deepStrictEqual(second, [], 'oncePerWar guard should suppress duplicate logs');
}

function run() {
    testSkipsWithoutDebugFlag();
    testLogsSnapshotOncePerWar();
    console.log('Combat frontier debug helper tests passed.');
}

run();
