const assert = require('assert');
const { startWar } = require('../scripts/combatEngine.js');

class TestHex {
    constructor(q, r, s = -q - r) {
        this.q = q;
        this.r = r;
        this.s = s;
    }

    toString() {
        return `${this.q},${this.r}`;
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

function analyzeTerritory(territory) {
    const summary = { player: 0, enemy: 0, neutral: 0 };
    territory.forEach((tile) => {
        if (!Object.prototype.hasOwnProperty.call(summary, tile.owner)) {
            throw new Error(`Unexpected owner: ${tile.owner}`);
        }
        summary[tile.owner] += 1;
    });
    return summary;
}

function testTerritorySymmetry() {
    const cleanupDom = stubDom();
    const game = buildGame();

    startWar(game, null, TestHex);

    const ownershipCounts = analyzeTerritory(game.combat.territory);
    assert.strictEqual(ownershipCounts.player, ownershipCounts.enemy, 'Both sides should control the same number of tiles');
    assert.ok(ownershipCounts.neutral > 0, 'Central neutral strip should be generated');

    game.combat.territory.forEach((tile) => {
        if (tile.owner === 'neutral') {
            assert.strictEqual(tile.hex.r, 0, 'Neutral tiles should only appear on the central axis');
            assert.strictEqual(tile.claimable, true, 'Neutral tiles must remain claimable');
        } else if (tile.owner === 'player') {
            assert.ok(tile.hex.r > 0, 'Player tiles should occupy the upper half of the map');
        } else if (tile.owner === 'enemy') {
            assert.ok(tile.hex.r < 0, 'Enemy tiles should occupy the lower half of the map');
        }
    });

    cleanupDom();
    console.log('Combat territory symmetry test passed.');
}

function testCastleMirroring() {
    const cleanupDom = stubDom();
    const game = buildGame();

    startWar(game, null, TestHex);

    assert.deepStrictEqual(
        game.combat.castles.player,
        new TestHex(0, 8),
        'Player castle should anchor on the upper center column'
    );
    assert.deepStrictEqual(
        game.combat.castles.enemy,
        new TestHex(0, -8),
        'Enemy castle should mirror the player castle across the central axis'
    );

    cleanupDom();
    console.log('Combat castle mirroring test passed.');
}

function run() {
    testTerritorySymmetry();
    testCastleMirroring();
}

run();
