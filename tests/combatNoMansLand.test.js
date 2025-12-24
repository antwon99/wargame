const assert = require('assert');
const { startWar, isFrontier, updateCombat } = require('../scripts/combatEngine.js');

class StubHex {
    constructor(q, r, s = -q - r) {
        this.q = q;
        this.r = r;
        this.s = s;
    }

    add(other) {
        return new StubHex(this.q + other.q, this.r + other.r, this.s + other.s);
    }

    toString() {
        return `${this.q},${this.r}`;
    }

    static round(hex) {
        return new StubHex(Math.round(hex.q), Math.round(hex.r), Math.round(hex.s));
    }

    static distance(a, b) {
        return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
    }

    static neighbor(hex, dir) {
        const dirs = [
            new StubHex(1, 0, -1), new StubHex(1, -1, 0), new StubHex(0, -1, 1),
            new StubHex(-1, 0, 1), new StubHex(-1, 1, 0), new StubHex(0, 1, -1)
        ];
        return hex.add(dirs[dir]);
    }
}

function stubDom() {
    const previousWindow = global.window;
    const previousDocument = global.document;
    const defaultElement = { classList: { add() {}, remove() {} }, innerText: '' };
    const elements = {
        'ui-overworld': { classList: { add() {}, remove() {} } },
        'ui-combat': { classList: { add() {}, remove() {} } },
        'state-txt': defaultElement
    };

    global.window = { innerWidth: 1920, innerHeight: 1080, enterCombat: () => {} };
    global.document = {
        getElementById: (id) => elements[id] || defaultElement
    };

    return () => {
        global.window = previousWindow;
        global.document = previousDocument;
    };
}

function buildGame() {
    const combat = {
        territory: new Map(),
        buildings: new Map(),
        slots: new Map(),
        units: [],
        fx: [],
        ai: { timer: 0, nextMove: 0, gold: 0 },
        castles: {}
    };

    return {
        Hex: StubHex,
        gold: 1000,
        difficulty: 0,
        timekeeper: { getCalendar: () => ({ month: 1 }) },
        spawnTxt: () => {},
        showFloatingText: () => {},
        triggerCameraShake: () => {},
        spawnParticleBurst: () => {},
        spawnBurstAtHex: () => {},
        resetSession() { this.session = { warKills: 0 }; },
        session: { warKills: 0 },
        stats: { warsWon: 0, warsFought: 0, bestKills: 0 },
        updateLeaderboardUI: () => {},
        state: 'OVERWORLD',
        combat,
        cam: { x: 0, y: 0, zoom: 1 },
        viewport: { width: 800, height: 600 },
        showWarTip: () => {},
        playWarStartFX: () => {},
        updateHUD: () => {},
        parseKey: (key) => {
            const [q, r] = key.split(',').map((value) => parseInt(value, 10));
            return new StubHex(q, r, -q - r);
        }
    };
}

function testWarStartsWithNeutralFrontline() {
    const restoreDom = stubDom();
    const game = buildGame();
    startWar(game, null, StubHex);

    const equatorTiles = [...game.combat.territory.values()].filter((tile) => tile.hex.r === 0);
    assert.ok(equatorTiles.length > 0, 'equator should seed tiles along the center row');
    assert.ok(
        equatorTiles.every((tile) => tile.owner === 'neutral'),
        'equator tiles should start neutral to form a no-man\'s-land'
    );

    const centerKey = new StubHex(0, 0, 0).toString();
    assert.strictEqual(
        isFrontier(game, centerKey, 'player', StubHex),
        false,
        'neutral frontline tiles should not be immediately buildable'
    );
    restoreDom();
}

function testFrontlineCapturesWhenTraversed() {
    const restoreDom = stubDom();
    const game = buildGame();
    startWar(game, null, StubHex);

    const centerKey = new StubHex(0, 0, 0).toString();
    const centerTile = game.combat.territory.get(centerKey);
    assert.strictEqual(centerTile.owner, 'neutral', 'center tile should seed as neutral');

    game.combat.units.push({
        type: 'soldier',
        owner: 'player',
        pos: { q: 0, r: 0, s: 0 },
        hp: 100,
        maxHp: 100,
        dmg: 10,
        range: 1,
        speed: 1,
        cooldown: 0
    });

    updateCombat(game, 0.016, StubHex);
    assert.strictEqual(
        game.combat.territory.get(centerKey).owner,
        'player',
        'neutral frontline should transfer ownership when a unit crosses it'
    );
    restoreDom();
}

function run() {
    testWarStartsWithNeutralFrontline();
    testFrontlineCapturesWhenTraversed();
    console.log('Combat no-man\'s-land tests passed.');
}

run();
