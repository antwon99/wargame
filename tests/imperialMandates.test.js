const assert = require('assert');
const RebelSystem = require('../scripts/rebelSystem.js');
const ImperialMandates = require('../scripts/imperialMandates.js');

class Hex {
    constructor(q, r, s = -q - r) { this.q = q; this.r = r; this.s = s; }
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
    const gameState = {
        Hex,
        overworld: { hexes: new Map() },
        gold: 0,
        wood: 0,
        calcOverworldGhosts: () => {},
        playSound: () => null
    };
    const addTile = (hex) => gameState.overworld.hexes.set(hex.toString(), { hex, type: 'field' });
    addTile(new Hex(0, 0));
    addTile(new Hex(1, 0));
    addTile(new Hex(0, 1));
    addTile(new Hex(1, 1));
    addTile(new Hex(-1, 0));
    return gameState;
}

function addTerritory(gameState, count) {
    const startIndex = gameState.overworld.hexes.size;
    for (let i = 0; i < count; i += 1) {
        const q = startIndex + i + 1;
        const r = -(startIndex + i + 1);
        const neighbor = new Hex(q, r);
        gameState.overworld.hexes.set(neighbor.toString(), { hex: neighbor, type: 'field' });
    }
}

function testRebelMandateLifecycle() {
    ImperialMandates.resetForNewCampaign();
    const gameState = buildGameState();
    const messages = [];
    const uiBindings = {
        showTileCallout: (game, tile, options) => { if (typeof options.onConfirm === 'function') options.onConfirm(); },
        hideTileCallout: () => null,
        showImperialModal: (config) => messages.push(config)
    };

    ImperialMandates.issuePendingMandates(gameState, uiBindings);
    const mandateState = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp;
    const trackedKey = mandateState.metadata.targetTileKey;
    assert.ok(trackedKey, 'rebel target should be stored after issuance');
    const rebelTile = gameState.overworld.hexes.get(trackedKey);

    ImperialMandates.recordEvent('battle_outcome', { result: 'DEFEAT', targetTile: rebelTile }, gameState, uiBindings);
    ImperialMandates.recordEvent('battle_outcome', { result: 'VICTORY', targetTile: rebelTile }, gameState, uiBindings);

    const finalState = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp;
    assert.strictEqual(finalState.status, ImperialMandates.MandateStatus.SUCCEEDED, 'victory should complete the mandate');
    assert.ok(!RebelSystem.isRebelCampTile(rebelTile), 'rebel flag should be cleared after success');
    assert.ok(messages.some((m) => m.title === 'Imperial Reprimand'), 'reprimand should render on defeat once');
}

function testTaxLevyPaths() {
    ImperialMandates.resetForNewCampaign();
    const gameState = buildGameState();
    gameState.gold = 200;
    ImperialMandates.issuePendingMandates(gameState);

    ImperialMandates.recordEvent('tick', { ticks: 3, gameState });
    const levyState = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    assert.strictEqual(levyState.status, ImperialMandates.MandateStatus.ACTIVE, 'levy should activate after early ticks');
    const goldBeforePayment = gameState.gold;

    ImperialMandates.recordEvent('tick', { ticks: 1, gameState });
    const resolvedLevy = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    assert.strictEqual(resolvedLevy.status, ImperialMandates.MandateStatus.SUCCEEDED, 'levy should succeed once funds are ready');
    assert.ok(gameState.gold < goldBeforePayment, 'levy payout should reduce total gold');

    ImperialMandates.resetForNewCampaign();
    const struggling = buildGameState();
    struggling.gold = 130;
    ImperialMandates.issuePendingMandates(struggling);
    ImperialMandates.recordEvent('tick', { ticks: 3, gameState: struggling });
    const failingLevy = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    assert.strictEqual(failingLevy.status, ImperialMandates.MandateStatus.ACTIVE, 'levy should activate for struggling treasury');
    ImperialMandates.recordEvent('tick', { ticks: 10, gameState: struggling });
    const failedState = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    assert.strictEqual(failedState.status, ImperialMandates.MandateStatus.FAILED, 'levy should fail after deadline expires');
    assert.ok(struggling.gold <= 130, 'failure should seize part of the treasury');
}

function testExpansionRewards() {
    ImperialMandates.resetForNewCampaign();
    const gameState = buildGameState();
    ImperialMandates.recordEvent('tick', { ticks: 5, gameState });
    const frontierState = ImperialMandates.getKingState().mandates.push_the_frontier;
    assert.strictEqual(frontierState.status, ImperialMandates.MandateStatus.ACTIVE, 'expansion mandate should activate after early ticks');
    const target = frontierState.metadata.targetTerritory;

    addTerritory(gameState, Math.max(0, target - gameState.overworld.hexes.size));
    ImperialMandates.recordEvent('tick', { ticks: 1, gameState });
    const completed = ImperialMandates.getKingState().mandates.push_the_frontier;
    assert.strictEqual(completed.status, ImperialMandates.MandateStatus.SUCCEEDED, 'expansion mandate should complete after adding territory');
    assert.ok(gameState.gold >= 75 && gameState.wood >= 40, 'completion should deliver signing bonuses');
}

function run() {
    testRebelMandateLifecycle();
    testTaxLevyPaths();
    testExpansionRewards();
    console.log('All imperial mandate tests passed.');
}

run();
