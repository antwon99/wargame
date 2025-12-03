const assert = require('assert');
const RebelSystem = require('../scripts/rebelSystem.js');
const ImperialMandates = require('../scripts/imperialMandates.js');
const { loseOverworldHexes } = require('../scripts/combatEngine.js');

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
    const gameState = { Hex, overworld: { hexes: new Map() }, calcOverworldGhosts: () => {} };
    const addTile = (hex) => gameState.overworld.hexes.set(hex.toString(), { hex, type: 'field' });
    addTile(new Hex(0, 0));
    addTile(new Hex(1, 0));
    addTile(new Hex(0, 1));
    addTile(new Hex(1, 1));
    addTile(new Hex(-1, 0));
    return gameState;
}

function prepareMandate(gameState, uiBindings) {
    ImperialMandates.resetForNewCampaign();
    ImperialMandates.issueInitialMandate(gameState, uiBindings);
    return gameState.overworld.hexes.get(ImperialMandates.getKingState().firstRebelMandate.targetTileKey);
}

function testIssueInitialMandateActivatesAndStoresTarget() {
    const gameState = buildGameState();
    const callouts = [];
    const uiBindings = {
        showTileCallout: (game, tile, options) => {
            callouts.push({ tile, options });
            if (typeof options.onConfirm === 'function') options.onConfirm();
        },
        hideTileCallout: () => callouts.push({ hidden: true })
    };

    const rebelTile = prepareMandate(gameState, uiBindings);
    const state = ImperialMandates.getKingState();

    assert.ok(rebelTile, 'mandate should spawn a rebel camp');
    assert.strictEqual(state.firstRebelMandate.status, ImperialMandates.MandateStatus.ACTIVE, 'mandate should become active');
    assert.ok(state.firstRebelMandate.targetTileKey, 'tracked rebel tile id should be stored');
    assert.strictEqual(state.preferAnchoredDecree, false, 'anchored renderer should be consumed after first decree');
    assert.strictEqual(callouts[0].options.title, 'By Imperial Decree:', 'opening decree should use anchored tile callout');
}

function testReprimandTriggersOnceOnDefeat() {
    const gameState = buildGameState();
    const decrees = [];
    const uiBindings = {
        showTileCallout: (game, tile, options) => { if (typeof options.onConfirm === 'function') options.onConfirm(); },
        hideTileCallout: () => null,
        showImperialModal: (config) => decrees.push(config)
    };

    const rebelTile = prepareMandate(gameState, uiBindings);

    ImperialMandates.handleBattleOutcome('DEFEAT', rebelTile, gameState, uiBindings);
    ImperialMandates.handleBattleOutcome('DEFEAT', rebelTile, gameState, uiBindings);

    const state = ImperialMandates.getKingState();
    assert.strictEqual(state.firstRebelMandate.status, ImperialMandates.MandateStatus.ACTIVE, 'mandate remains active after defeat');
    assert.ok(state.firstRebelMandate.reprimandShown, 'reprimand flag should be set');
    assert.strictEqual(decrees.length, 1, 'reprimand should only render once');
    assert.strictEqual(decrees[0].title, 'Imperial Reprimand', 'reprimand title should be forwarded');
}

function testVictoryCompletesMandateAndCleansRebelFlag() {
    const gameState = buildGameState();
    const decrees = [];
    const uiBindings = {
        showTileCallout: (game, tile, options) => { if (typeof options.onConfirm === 'function') options.onConfirm(); },
        hideTileCallout: () => null,
        showImperialModal: (config) => decrees.push(config)
    };

    const rebelTile = prepareMandate(gameState, uiBindings);
    ImperialMandates.handleBattleOutcome('VICTORY', rebelTile, gameState, uiBindings);

    const state = ImperialMandates.getKingState();
    assert.strictEqual(state.firstRebelMandate.status, ImperialMandates.MandateStatus.COMPLETED, 'mandate should complete on victory');
    assert.ok(!RebelSystem.isRebelCampTile(rebelTile), 'rebel flag should be removed after completion');
    assert.strictEqual(decrees[0].title, 'The Emperor is pleased.', 'victory decree should use the Emperor acknowledgment');
}

function testProtectedKeysSurviveDefeatPenalty() {
    const gameState = buildGameState();
    const uiBindings = {
        showTileCallout: (game, tile, options) => { if (typeof options.onConfirm === 'function') options.onConfirm(); },
        hideTileCallout: () => null
    };
    const rebelTile = prepareMandate(gameState, uiBindings);
    const trackedKey = ImperialMandates.getKingState().firstRebelMandate.targetTileKey;

    const protectedKeys = ImperialMandates.getProtectedOverworldKeys();
    assert.ok(protectedKeys.has(trackedKey), 'tracked rebel tile should be protected while active');

    loseOverworldHexes(gameState, 10, protectedKeys);
    assert.ok(gameState.overworld.hexes.has(trackedKey), 'protected rebel tile should survive overworld loss');
}

function run() {
    testIssueInitialMandateActivatesAndStoresTarget();
    testReprimandTriggersOnceOnDefeat();
    testVictoryCompletesMandateAndCleansRebelFlag();
    testProtectedKeysSurviveDefeatPenalty();
    console.log('All imperial mandate tests passed.');
}

run();
