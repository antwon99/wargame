const assert = require('assert');
const { endWar } = require('../scripts/combatEngine.js');
const ImperialMandates = require('../scripts/imperialMandates.js');

class Hex {
    constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
    toString() { return `${this.q},${this.r}`; }
    toPixel() { return { x: this.q * 10, y: this.r * 10 }; }
    static neighbor(hex, dir) {
        const dirs = [
            new Hex(1, 0, -1), new Hex(1, -1, 0), new Hex(0, -1, 1),
            new Hex(-1, 0, 1), new Hex(-1, 1, 0), new Hex(0, 1, -1)
        ];
        const delta = dirs[dir];
        return new Hex(hex.q + delta.q, hex.r + delta.r, hex.s + delta.s);
    }
}

function createElement() {
    const classes = new Set();
    return {
        style: {},
        classList: {
            add: (...names) => names.forEach((n) => classes.add(n)),
            remove: (...names) => names.forEach((n) => classes.delete(n))
        },
        set innerText(value) { this._innerText = value; },
        get innerText() { return this._innerText; }
    };
}

function buildGame() {
    const overworld = { hexes: new Map(), claimable: new Map() };
    const addTile = (q, r, type = 'field') => {
        const hex = new Hex(q, r);
        const tile = { hex, type };
        overworld.hexes.set(hex.toString(), tile);
        return tile;
    };

    const game = {
        Hex,
        overworld,
        research: { lives: 0 },
        difficulty: 0,
        stats: { totalKills: 0, bestKills: 0, bestLevel: 0, warsWon: 0, warsFought: 0 },
        session: { warKills: 0 },
        cam: { x: 0, y: 0, zoom: 1 },
        viewport: { width: 800, height: 600 },
        hideWarTip: () => null,
        updateHUD: () => null,
        armAmbientLoop: () => null,
        calcOverworldGhosts: () => null,
        spawnTxt: () => null,
        updateLeaderboardUI: () => null,
        saveGame: () => null,
        fxLayer: null,
        combat: { particles: [] }
    };

    game.projectHexToScreen = (hex) => ({ x: hex.q * 10 + 100, y: hex.r * 10 + 80 });

    const floatingTexts = [];
    const bursts = [];
    game.showFloatingText = (x, y, text, cssClass) => floatingTexts.push({ x, y, text, cssClass });
    game.spawnParticleBurst = (x, y, count, colors) => bursts.push({ x, y, count, colors });

    return { game, addTile, floatingTexts, bursts };
}

function withPatchedRandom(sequence, fn) {
    const original = Math.random;
    let idx = 0;
    Math.random = () => {
        const value = sequence[Math.min(idx, sequence.length - 1)];
        idx += 1;
        return value;
    };
    try { fn(); } finally { Math.random = original; }
}

function testEndWarHighlightsLostTiles() {
    const { game, addTile, floatingTexts, bursts } = buildGame();
    const castle = addTile(0, 0, 'castle');
    const protectedTile = addTile(1, 0);
    addTile(2, 0);
    addTile(0, 1);

    game.pendingClearTile = protectedTile;
    game.state = 'COMBAT';
    game.research.lives = 0;

    const originalWindow = global.window;
    const originalDocument = global.document;
    const uiOverworld = createElement();
    const uiCombat = createElement();
    const stateTxt = createElement();
    global.window = { innerWidth: 1024, innerHeight: 768 };
    global.document = {
        getElementById: (id) => {
            if (id === 'ui-overworld') return uiOverworld;
            if (id === 'ui-combat') return uiCombat;
            if (id === 'state-txt') return stateTxt;
            return null;
        }
    };

    const originalHandleOutcome = ImperialMandates.handleBattleOutcome;
    const originalProtectedKeys = ImperialMandates.getProtectedOverworldKeys;
    ImperialMandates.handleBattleOutcome = () => null;
    ImperialMandates.getProtectedOverworldKeys = () => new Set();

    withPatchedRandom([0.0, 0.1, 0.8], () => {
        endWar(game, 'DEFEAT');
    });

    ImperialMandates.handleBattleOutcome = originalHandleOutcome;
    ImperialMandates.getProtectedOverworldKeys = originalProtectedKeys;
    global.window = originalWindow;
    global.document = originalDocument;

    const lossLabels = floatingTexts.filter((entry) => entry.text === 'Scorched' || entry.text === 'Rebel Camp');
    assert.strictEqual(lossLabels.length, 2, 'converted tiles should emit per-tile highlights');
    const summary = floatingTexts.find((entry) => entry.text.startsWith('Defeat:'));
    assert.ok(summary, 'defeat should surface a summary floating label');
    assert.ok(summary.text.includes('1 tile scorched'), 'summary should count scorched tiles');
    assert.ok(summary.text.includes('1 rebel camp'), 'summary should count rebel camps');
    assert.strictEqual(game.overworld.hexes.get(protectedTile.hex.toString()).type, 'field', 'pending target should remain protected');
    assert.ok(bursts.length >= 2, 'particle bursts should accompany tile highlights');
    assert.strictEqual(game.state, 'OVERWORLD', 'endWar should return game to overworld state');
    assert.strictEqual(stateTxt.innerText, 'KINGDOM', 'state text should update after resolution');
    assert.ok(uiOverworld.classList, 'overworld UI element should be present');
}

function run() {
    testEndWarHighlightsLostTiles();
    console.log('All endWar loss highlight tests passed.');
}

run();
