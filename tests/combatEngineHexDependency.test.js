import assert from 'assert';
import { checkConnection, isFrontier } from '../scripts/combatEngine.js';

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

function run() {
    testCheckConnectionUsesInjectedHex();
    testIsFrontierUsesInjectedHex();
    console.log('Combat engine Hex dependency tests passed.');
}

run();
