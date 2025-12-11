const assert = require('assert');
const { checkConnection, isFrontier } = require('../scripts/combatEngine.js');

// These tests focus on the frontier rules that hinge on the three-hex castle safety bubble and
// the neutral buffer that splits the map. Scenarios ensure tiles inside the bubble skip normal
// adjacency checks while tiles beyond it still honor frontier requirements.

class CountingHex {
    constructor(q, r, s = -q - r) {
        this.q = q;
        this.r = r;
        this.s = s;
    }

    add(other) { return new CountingHex(this.q + other.q, this.r + other.r, this.s + other.s); }
    equals(other) { return this.q === other.q && this.r === other.r && this.s === other.s; }
    toString() { return `${this.q},${this.r}`; }

    static round(h) { return new CountingHex(Math.round(h.q), Math.round(h.r), Math.round(h.s)); }
    static distance(a, b) { return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2; }
    static neighbor(hex, dir) {
        CountingHex.neighborCalls++;
        const dirs = [
            new CountingHex(1, 0, -1), new CountingHex(1, -1, 0), new CountingHex(0, -1, 1),
            new CountingHex(-1, 0, 1), new CountingHex(-1, 1, 0), new CountingHex(0, 1, -1)
        ];
        return hex.add(dirs[dir]);
    }
}
CountingHex.neighborCalls = 0;

function buildGame(hexImpl) {
    const castle = new hexImpl(0, 0, 0);
    const frontier = new hexImpl(1, 0, -1);
    const territory = new Map();
    territory.set(castle.toString(), { owner: 'player', hex: castle });
    territory.set(frontier.toString(), { owner: 'player', hex: frontier });

    return {
        Hex: hexImpl,
        combat: {
            territory,
            slots: new Map(),
            buildings: new Map(),
            castles: { player: castle, enemy: null }
        },
        parseKey: (key) => {
            const [q, r] = key.split(',').map((v) => parseInt(v, 10));
            return new hexImpl(q, r, -q - r);
        }
    };
}

function testCheckConnectionUsesInjectedHex() {
    const previousHex = global.Hex;
    delete global.Hex;

    CountingHex.neighborCalls = 0;
    const game = buildGame(CountingHex);
    const connected = checkConnection(game, game.parseKey('1,0'), 'player', CountingHex);

    assert.ok(connected, 'tile should be connected to the injected Hex castle coordinate');
    assert.ok(CountingHex.neighborCalls > 0, 'injected Hex.neighbor should be used for traversal');

    global.Hex = previousHex;
}

function testIsFrontierUsesInjectedHex() {
    const previousHex = global.Hex;
    delete global.Hex;

    CountingHex.neighborCalls = 0;
    const game = buildGame(CountingHex);
    const castleKey = game.combat.castles.player.toString();
    game.combat.buildings.set(castleKey, { owner: 'player', type: 'castle' });

    const frontierKey = game.parseKey('1,0').toString();
    const result = isFrontier(game, frontierKey, 'player', CountingHex);

    assert.ok(result, 'adjacent tiles should register as frontier when using injected Hex');
    assert.ok(CountingHex.neighborCalls > 0, 'frontier checks should rely on injected Hex math');

    global.Hex = previousHex;
}

function testOwnedTileInsideThreeHexBubbleIsFrontier() {
    const castle = new CountingHex(0, 0, 0);
    const bubbleEdge = new CountingHex(3, 0, -3);
    const territory = new Map([
        [castle.toString(), { owner: 'player', hex: castle }],
        [bubbleEdge.toString(), { owner: 'player', hex: bubbleEdge }]
    ]);

    const game = {
        Hex: CountingHex,
        parseKey: (key) => {
            const [q, r] = key.split(',').map((v) => parseInt(v, 10));
            return new CountingHex(q, r, -q - r);
        },
        combat: {
            territory,
            slots: new Map([[bubbleEdge.toString(), 'mine']]),
            buildings: new Map([[castle.toString(), { owner: 'player', type: 'castle' }]]),
            castles: { player: castle, enemy: null }
        }
    };

    assert.strictEqual(isFrontier(game, bubbleEdge.toString(), 'player', CountingHex), true,
        'owned tiles within the three-hex castle rule should be frontier even without adjacency');
}

function testOwnedTileBeyondThreeHexBubbleRequiresAdjacency() {
    const castle = new CountingHex(0, 0, 0);
    const farTile = new CountingHex(4, 0, -4);
    const territory = new Map([
        [castle.toString(), { owner: 'player', hex: castle }],
        [farTile.toString(), { owner: 'player', hex: farTile }]
    ]);

    const game = {
        Hex: CountingHex,
        parseKey: (key) => {
            const [q, r] = key.split(',').map((v) => parseInt(v, 10));
            return new CountingHex(q, r, -q - r);
        },
        combat: {
            territory,
            slots: new Map([[farTile.toString(), 'mine']]),
            buildings: new Map([[castle.toString(), { owner: 'player', type: 'castle' }]]),
            castles: { player: castle, enemy: null }
        }
    };

    assert.strictEqual(isFrontier(game, farTile.toString(), 'player', CountingHex), false,
        'tiles outside the three-hex castle rule should need standard frontier adjacency');
}

function testNeutralAcrossCenterUnlocksWhenAdjacentToCastleBubble() {
    const castle = new CountingHex(0, -3, 3);
    const bridge = new CountingHex(0, 0, 0);
    const neutral = new CountingHex(0, 1, -1);

    const territory = new Map([
        [castle.toString(), { owner: 'player', hex: castle }],
        [bridge.toString(), { owner: 'player', hex: bridge }],
        [neutral.toString(), { owner: 'neutral', hex: neutral, claimable: true }]
    ]);

    const game = {
        Hex: CountingHex,
        parseKey: (key) => {
            const [q, r] = key.split(',').map((v) => parseInt(v, 10));
            return new CountingHex(q, r, -q - r);
        },
        combat: {
            territory,
            slots: new Map([[neutral.toString(), 'barracks']]),
            buildings: new Map([[castle.toString(), { owner: 'player', type: 'castle' }]]),
            castles: { player: castle, enemy: null }
        }
    };

    assert.strictEqual(isFrontier(game, neutral.toString(), 'player', CountingHex), true,
        'neutral tiles across center should unlock when adjacent to three-hex-bubble territory');
}

function testNeutralStripUnlocksWhenBridged() {
    const castle = new CountingHex(0, 5, -5);
    const neutral = new CountingHex(0, 0, 0);
    const friendly = new CountingHex(0, 1, -1);

    const territory = new Map([
        [castle.toString(), { owner: 'player', hex: castle }],
        [neutral.toString(), { owner: 'neutral', hex: neutral, claimable: true }],
        [friendly.toString(), { owner: 'enemy', hex: friendly }]
    ]);

    const game = {
        Hex: CountingHex,
        parseKey: (key) => {
            const [q, r] = key.split(',').map((v) => parseInt(v, 10));
            return new CountingHex(q, r, -q - r);
        },
        combat: {
            territory,
            slots: new Map([[neutral.toString(), 'barracks']]),
            buildings: new Map(),
            castles: { player: castle, enemy: null }
        }
    };

    const targetKey = neutral.toString();
    assert.strictEqual(isFrontier(game, targetKey, 'player', CountingHex), false,
        'neutral strip should stay locked without adjacent player territory');

    territory.set(friendly.toString(), { owner: 'player', hex: friendly });
    assert.strictEqual(isFrontier(game, targetKey, 'player', CountingHex), true,
        'neutral strip should become frontier once player territory bridges the center');
}

function run() {
    testCheckConnectionUsesInjectedHex();
    testIsFrontierUsesInjectedHex();
    testOwnedTileInsideThreeHexBubbleIsFrontier();
    testOwnedTileBeyondThreeHexBubbleRequiresAdjacency();
    testNeutralAcrossCenterUnlocksWhenAdjacentToCastleBubble();
    testNeutralStripUnlocksWhenBridged();
    console.log('Combat engine Hex dependency tests passed.');
}

run();
