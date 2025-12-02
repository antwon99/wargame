const assert = require('assert');
const RebelSystem = require('../scripts/rebelSystem.js');
const ImperialMandates = require('../scripts/imperialMandates.js');

class Hex {
    constructor(q, r, s = -q - r) {
        this.q = q; this.r = r; this.s = s;
    }
    toString() { return `${this.q},${this.r}`; }
    static neighbor(hex, dir) {
        const dirs = [
            new Hex(1, 0, -1), new Hex(1, -1, 0), new Hex(0, -1, 1),
            new Hex(-1, 0, 1), new Hex(-1, 1, 0), new Hex(0, 1, -1)
        ];
        return new Hex(hex.q + dirs[dir].q, hex.r + dirs[dir].r, hex.s + dirs[dir].s);
    }
}

function buildGameState() {
    const gameState = { Hex, overworld: { hexes: new Map() } };
    const addTile = (hex) => gameState.overworld.hexes.set(hex.toString(), { hex, type: 'field' });
    addTile(new Hex(0, 0));
    addTile(new Hex(1, 0));
    addTile(new Hex(0, 1));
    return gameState;
}

function testRebelSpawnMarksFrontierTile() {
    const gameState = buildGameState();
    const rebel = RebelSystem.spawnRebelCampNearFrontier(gameState);
    assert.ok(rebel, 'rebel camp should spawn on a frontier tile');
    assert.ok(RebelSystem.isRebelCampTile(rebel), 'spawned tile should be marked as rebel camp');
    const stored = gameState.overworld.hexes.get(rebel.hex.toString());
    assert.ok(stored.isRebelCamp, 'map entry should persist rebel flag');
}

function testInitializeImperialIntroActivatesMandate() {
    const gameState = buildGameState();
    ImperialMandates.resetMandateState();
    const callouts = [];
    const uiBindings = {
        showTileCallout: (game, tile, options) => {
            callouts.push({ tile, options });
            if (typeof options.onConfirm === 'function') options.onConfirm();
        },
        hideTileCallout: () => callouts.push({ hidden: true })
    };

    ImperialMandates.initializeImperialIntro(gameState, uiBindings);
    const state = ImperialMandates.getMandateState();

    assert.strictEqual(callouts[0].options.title, 'By Imperial Decree:', 'opening decree should be shown as a callout');
    assert.ok(state.firstMandateActive, 'mandate should be active after spawning rebel camp');
    assert.ok(state.firstMandateRebelTileId, 'tracked rebel tile id should be stored');
}

function testHandleTileClearedCompletesMandate() {
    const gameState = buildGameState();
    ImperialMandates.resetMandateState();

    const uiBindings = {
        showTileCallout: (game, tile, options) => { if (typeof options.onConfirm === 'function') options.onConfirm(); },
        hideTileCallout: () => null
    };

    ImperialMandates.initializeImperialIntro(gameState, uiBindings);
    const trackedId = ImperialMandates.getMandateState().firstMandateRebelTileId;
    const trackedTile = gameState.overworld.hexes.get(trackedId);

    // different tile should not complete
    const neighborTile = { hex: new Hex(5, 5), type: 'field' };
    ImperialMandates.handleTileCleared(neighborTile, gameState, uiBindings);
    assert.ok(ImperialMandates.getMandateState().firstMandateActive, 'mandate remains active when other tiles cleared');

    ImperialMandates.handleTileCleared(trackedTile, gameState, uiBindings);
    const state = ImperialMandates.getMandateState();
    assert.ok(state.firstMandateCompleted, 'mandate completes when rebel camp cleared');
    assert.ok(!RebelSystem.isRebelCampTile(trackedTile), 'rebel flag should be removed after completion');
}

function testDecreeCalloutSupportsBoundHelpers() {
    const gameState = buildGameState();
    ImperialMandates.resetMandateState();

    const callouts = [];
    const uiBindings = {
        showTileCallout: (tile, options) => {
            callouts.push({ tile, options });
            if (typeof options.onConfirm === 'function') options.onConfirm();
        },
        hideTileCallout: () => callouts.push({ hidden: true })
    };

    ImperialMandates.initializeImperialIntro(gameState, uiBindings);
    const state = ImperialMandates.getMandateState();
    const trackedTile = gameState.overworld.hexes.get(state.firstMandateRebelTileId);

    assert.strictEqual(callouts[0].tile, trackedTile, 'rebel camp tile should anchor bound callout helper');
}

function run() {
    testRebelSpawnMarksFrontierTile();
    testInitializeImperialIntroActivatesMandate();
    testHandleTileClearedCompletesMandate();
    testDecreeCalloutSupportsBoundHelpers();
    console.log('All imperial mandate tests passed.');
}

run();
