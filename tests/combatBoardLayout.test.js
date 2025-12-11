const assert = require('assert');
const { startWar } = require('../scripts/combatEngine.js');

class TestHex {
    constructor(q, r, s = -q - r) {
        this.q = q;
        this.r = r;
        this.s = s;
    }

    add(other) {
        return new TestHex(this.q + other.q, this.r + other.r, this.s + other.s);
    }

    equals(other) {
        return this.q === other.q && this.r === other.r;
    }

    toString() {
        return `${this.q},${this.r}`;
    }

    static neighbor(hex, dir) {
        const dirs = [
            new TestHex(1, 0, -1),
            new TestHex(1, -1, 0),
            new TestHex(0, -1, 1),
            new TestHex(-1, 0, 1),
            new TestHex(-1, 1, 0),
            new TestHex(0, 1, -1)
        ];
        return hex.add(dirs[dir]);
    }
}

function stubDom() {
    const elements = {
        'ui-overworld': { classList: { add() {}, remove() {} } },
        'ui-combat': { classList: { add() {}, remove() {} } },
        'state-txt': { classList: { add() {}, remove() {} }, innerText: '' }
    };

    const previousDocument = global.document;
    const previousWindow = global.window;

    global.document = {
        getElementById: (id) => elements[id]
    };
    global.window = { innerWidth: 800, innerHeight: 600, enterCombat() {} };

    return () => {
        global.document = previousDocument;
        global.window = previousWindow;
    };
}

function buildGame() {
    const game = {
        Hex: TestHex,
        difficulty: 0,
        gold: 1000,
        timekeeper: { getCalendar: () => ({ month: 1 }) },
        spawnTxt() {},
        showFloatingText() {},
        triggerCameraShake() {},
        spawnParticleBurst() {},
        resetSession() {},
        stats: { warsFought: 0 },
        updateLeaderboardUI() {},
        state: 'PEACE',
        parseKey: (key) => {
            const [q, r] = key.split(',').map(Number);
            return new TestHex(q, r);
        },
        combat: {
            territory: new Map(),
            buildings: new Map(),
            slots: new Map(),
            units: [],
            fx: [],
            ai: { timer: 0, nextMove: 0, gold: 0 },
            castles: {}
        },
        cam: {},
        viewport: { width: 100, height: 100 },
        deviceProfile: { isMobile: false, baseZoom: 1 },
        updateHUD() {},
        showWarTip() {},
        playWarStartFX() {},
        spawnBurstAtHex() {},
        playSound() {}
    };

    return game;
}

function summarizeTerritory(territory) {
    const counts = { player: 0, enemy: 0, neutral: 0 };
    const neutralRows = new Set();
    for (let tile of territory.values()) {
        if (!Object.prototype.hasOwnProperty.call(counts, tile.owner)) {
            throw new Error(`Unexpected owner: ${tile.owner}`);
        }
        counts[tile.owner] += 1;
        if (tile.owner === 'neutral') neutralRows.add(tile.hex.r);
    }
    return { counts, neutralRows };
}

function assertNeutralStripReachable(game) {
    const neutrals = [...game.combat.territory.values()].filter((tile) => tile.owner === 'neutral');
    for (let tile of neutrals) {
        const neighborOwners = new Set();
        for (let i = 0; i < 6; i++) {
            const neighborKey = TestHex.neighbor(tile.hex, i).toString();
            const neighborTile = game.combat.territory.get(neighborKey);
            if (neighborTile) neighborOwners.add(neighborTile.owner);
        }
        assert.ok(neighborOwners.has('player'), 'Neutral tiles should border player territory for claimability');
        assert.ok(neighborOwners.has('enemy'), 'Neutral tiles should border enemy territory for contestability');
    }
}

function testBalancedOwnership() {
    const cleanupDom = stubDom();
    const game = buildGame();

    startWar(game, null, TestHex);

    const { counts, neutralRows } = summarizeTerritory(game.combat.territory);
    assert.strictEqual(counts.player, counts.enemy, 'Both sides should control the same number of tiles');
    assert.ok(neutralRows.size === 0 || (neutralRows.size === 1 && neutralRows.has(0)), 'Neutral tiles must form a single equator row or be absent');

    const centerTile = game.combat.territory.get('0,0');
    assert.ok(centerTile, 'Center tile should exist on the combat board');
    if (centerTile.owner === 'neutral') {
        assert.strictEqual(centerTile.claimable, true, 'Central neutral tile must be claimable');
    }

    cleanupDom();
    console.log('Balanced ownership layout test passed.');
}

function testNeutralStripAdjacency() {
    const cleanupDom = stubDom();
    const game = buildGame();

    startWar(game, null, TestHex);
    assertNeutralStripReachable(game);

    cleanupDom();
    console.log('Neutral strip adjacency test passed.');
}

function run() {
    testBalancedOwnership();
    testNeutralStripAdjacency();
}

run();
