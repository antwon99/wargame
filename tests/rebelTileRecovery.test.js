const assert = require('assert');
const { endWar } = require('../scripts/combatEngine.js');
const ImperialMandatesBootstrap = require('../scripts/mandates/imperialMandates.js');
const ImperialMandates = ImperialMandatesBootstrap.initImperialMandates
    ? ImperialMandatesBootstrap.initImperialMandates(global)
    : ImperialMandatesBootstrap;

class Hex {
    constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
    toString() { return `${this.q},${this.r}`; }
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
    const game = {
        Hex,
        overworld,
        research: { lives: 0 },
        difficulty: 0,
        gold: 0,
        wood: 0,
        stats: { totalKills: 0, bestKills: 0, bestLevel: 0, warsWon: 0, warsFought: 0 },
        session: { warKills: 0 },
        cam: { x: 0, y: 0, zoom: 1 },
        viewport: { width: 800, height: 600 },
        hideWarTip: () => null,
        updateHUD: () => null,
        armAmbientLoop: () => null,
        calcOverworldGhosts: () => null,
        refreshClusterBonuses: () => null,
        spawnTxt: () => null,
        showFloatingText: () => null,
        updateLeaderboardUI: () => null,
        saveGame: () => null,
        combat: { particles: [] }
    };
    return game;
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

function withUiShell(fn) {
    const originalWindow = global.window;
    const originalDocument = global.document;
    const uiOverworld = createElement();
    const uiCombat = createElement();
    const stateTxt = createElement();
    global.window = { innerWidth: 1024, innerHeight: 768, exitCombat: () => null };
    global.document = {
        getElementById: (id) => {
            if (id === 'ui-overworld') return uiOverworld;
            if (id === 'ui-combat') return uiCombat;
            if (id === 'state-txt') return stateTxt;
            return null;
        }
    };
    try { fn(); } finally { global.window = originalWindow; global.document = originalDocument; }
}

function withMandateStubs(fn) {
    const originalHandleOutcome = ImperialMandates.handleBattleOutcome;
    const originalProtectedKeys = ImperialMandates.getProtectedOverworldKeys;
    ImperialMandates.handleBattleOutcome = () => null;
    ImperialMandates.getProtectedOverworldKeys = () => new Set();
    try { fn(); } finally {
        ImperialMandates.handleBattleOutcome = originalHandleOutcome;
        ImperialMandates.getProtectedOverworldKeys = originalProtectedKeys;
    }
}

function testRebelCampVictoryRestoresTerrain() {
    const game = buildGame();
    const hex = new Hex(0, 0);
    const tile = { hex, type: 'rebelcamp', owner: 'rebel', isRebelCamp: true, prevType: 'field' };
    game.overworld.hexes.set(hex.toString(), tile);
    game.pendingClearTile = tile;
    game.state = 'COMBAT';

    withUiShell(() => {
        withMandateStubs(() => {
            withPatchedRandom([0.0], () => {
                endWar(game, 'VICTORY');
            });
        });
    });

    const updated = game.overworld.hexes.get(hex.toString());
    assert.strictEqual(updated.owner, 'player', 'victory should restore rebel camps to player control');
    assert.strictEqual(updated.type, 'field', 'victory should roll a new terrain type');
    assert.ok(!updated.isRebelCamp, 'rebel camp flags should clear after victory');
    assert.ok(!updated.prevType, 'rebel metadata should be removed after conversion');
}

function run() {
    testRebelCampVictoryRestoresTerrain();
    console.log('Rebel tile recovery tests passed.');
}

run();
