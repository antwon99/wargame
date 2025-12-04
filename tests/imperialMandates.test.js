const assert = require('assert');
const RebelSystem = require('../scripts/rebelSystem.js');
const ImperialMandates = require('../scripts/imperialMandates.js');
const ImperialMandateManager = require('../scripts/imperialMandateManager.js');

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

function buildNotificationBindings() {
    const notifications = [];
    return {
        notifications,
        uiBindings: {
            enqueueNotification: (payload) => notifications.push(payload)
        }
    };
}

function waitForImperialTicks() {
    return new Promise((resolve) => setTimeout(resolve, 5));
}

async function advanceImperialTicks(count, gameState, uiBindings = {}) {
    for (let i = 0; i < count; i += 1) {
        ImperialMandateManager.advanceTick(gameState, uiBindings);
    }
    await waitForImperialTicks();
}

async function testMandateIssuanceAndDeadlines() {
    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const gameState = buildGameState();
    gameState.gold = 200;

    const { notifications, uiBindings } = buildNotificationBindings();
    uiBindings.showImperialModal = (config) => notifications.push(config);
    ImperialMandates.issuePendingMandates(gameState, uiBindings);

    let state = ImperialMandates.getKingState().mandates;
    assert.strictEqual(state.destroy_first_rebel_camp.status, ImperialMandates.MandateStatus.ACTIVE, 'rebel mandate should issue immediately when overworld exists');
    assert.strictEqual(state.levy_tithed_gold.status, ImperialMandates.MandateStatus.PENDING, 'levy should wait for early ticks before triggering');
    assert.strictEqual(state.push_the_frontier.status, ImperialMandates.MandateStatus.PENDING, 'expansion mandate should wait for its trigger window');
    assert.ok(state.destroy_first_rebel_camp.deadlineTick >= state.destroy_first_rebel_camp.issuedTick + 15 - 1, 'rebel mandate should set a deadline from issuance');

    await advanceImperialTicks(2, gameState, uiBindings);
    state = ImperialMandates.getKingState().mandates;
    assert.strictEqual(state.levy_tithed_gold.status, ImperialMandates.MandateStatus.ACTIVE, 'levy mandate should issue after tick 2 when gold threshold is met');
    assert.strictEqual(state.levy_tithed_gold.deadlineTick, state.levy_tithed_gold.issuedTick + 8, 'levy deadline should be based on durationTicks');

    await advanceImperialTicks(2, gameState, uiBindings);
    state = ImperialMandates.getKingState().mandates;
    assert.strictEqual(state.push_the_frontier.status, ImperialMandates.MandateStatus.ACTIVE, 'expansion mandate should issue after tick 4 with enough territory');
    assert.strictEqual(state.push_the_frontier.deadlineTick, state.push_the_frontier.issuedTick + 12, 'expansion deadline should be based on durationTicks');
    assert.ok(notifications.length >= 1, 'imperial messaging should fire during mandate issuance');
}

async function testRebelMandateResolutionAndExpiry() {
    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const gameState = buildGameState();
    const notificationBindings = buildNotificationBindings();
    const uiBindings = {
        ...notificationBindings.uiBindings,
        showTileCallout: (game, tile, options) => { if (typeof options.onConfirm === 'function') options.onConfirm(); },
        hideTileCallout: () => null
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
    assert.ok(notificationBindings.notifications.some((m) => m.title === 'Imperial Reprimand'), 'reprimand should render on defeat once');

    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const stubbornGame = buildGameState();
    ImperialMandates.issuePendingMandates(stubbornGame, uiBindings);
    await advanceImperialTicks(16, stubbornGame, uiBindings);
    const failedState = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp;
    assert.strictEqual(failedState.status, ImperialMandates.MandateStatus.FAILED, 'rebel mandate should fail when deadline is exceeded');
}

async function testTaxLevyDeadlinePaths() {
    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const gameState = buildGameState();
    gameState.gold = 220;
    const earlyCycle = buildNotificationBindings();
    ImperialMandates.issuePendingMandates(gameState, earlyCycle.uiBindings);

    await advanceImperialTicks(3, gameState, earlyCycle.uiBindings);
    const levyState = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    const goldBeforePayment = gameState.gold;
    assert.strictEqual(levyState.status, ImperialMandates.MandateStatus.ACTIVE, 'levy should activate after early ticks');

    await advanceImperialTicks(1, gameState, earlyCycle.uiBindings);
    const resolvedLevy = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    assert.strictEqual(resolvedLevy.status, ImperialMandates.MandateStatus.SUCCEEDED, 'levy should succeed once funds are ready');
    assert.ok(gameState.gold < goldBeforePayment, 'levy payout should reduce total gold');

    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const struggling = buildGameState();
    struggling.gold = 130;
    const strugglingNotifications = buildNotificationBindings();
    ImperialMandates.issuePendingMandates(struggling, strugglingNotifications.uiBindings);
    await advanceImperialTicks(3, struggling, strugglingNotifications.uiBindings);
    const failingLevy = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    assert.strictEqual(failingLevy.status, ImperialMandates.MandateStatus.ACTIVE, 'levy should activate for struggling treasury');
    await advanceImperialTicks(10, struggling, strugglingNotifications.uiBindings);
    const failedState = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    assert.strictEqual(failedState.status, ImperialMandates.MandateStatus.FAILED, 'levy should fail after deadline expires');
    assert.ok(struggling.gold <= 130, 'failure should seize part of the treasury');
}

async function testExpansionRewardsAndExpiry() {
    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const gameState = buildGameState();
    const { uiBindings } = buildNotificationBindings();
    await advanceImperialTicks(5, gameState, uiBindings);
    const frontierState = ImperialMandates.getKingState().mandates.push_the_frontier;
    assert.strictEqual(frontierState.status, ImperialMandates.MandateStatus.ACTIVE, 'expansion mandate should activate after early ticks');
    const target = frontierState.metadata.targetTerritory;

    addTerritory(gameState, Math.max(0, target - gameState.overworld.hexes.size));
    await advanceImperialTicks(1, gameState, uiBindings);
    const completed = ImperialMandates.getKingState().mandates.push_the_frontier;
    assert.strictEqual(completed.status, ImperialMandates.MandateStatus.SUCCEEDED, 'expansion mandate should complete after adding territory');
    assert.ok(gameState.gold >= 75 && gameState.wood >= 40, 'completion should deliver signing bonuses');

    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const stalled = buildGameState();
    await advanceImperialTicks(6, stalled, uiBindings);
    const stalledMandate = ImperialMandates.getKingState().mandates.push_the_frontier;
    assert.strictEqual(stalledMandate.status, ImperialMandates.MandateStatus.ACTIVE, 'expansion mandate should be active before expiry');
    await advanceImperialTicks(12, stalled, uiBindings);
    const expired = ImperialMandates.getKingState().mandates.push_the_frontier;
    assert.strictEqual(expired.status, ImperialMandates.MandateStatus.FAILED, 'expansion mandate should fail when deadline passes without growth');
}

async function testNonBlockingTickQueue() {
    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const gameState = buildGameState();

    ImperialMandates.issuePendingMandates(gameState);
    const initialTicks = ImperialMandates.getKingState().currentTick;
    ImperialMandateManager.advanceTick(gameState);
    const midTicks = ImperialMandates.getKingState().currentTick;
    assert.strictEqual(midTicks, initialTicks, 'queued ticks should not increment the counter immediately');

    await waitForImperialTicks();
    const finalTicks = ImperialMandates.getKingState().currentTick;
    assert.strictEqual(finalTicks, initialTicks + 1, 'flush should advance the authoritative tick counter');
}

async function run() {
    await testMandateIssuanceAndDeadlines();
    await testRebelMandateResolutionAndExpiry();
    await testTaxLevyDeadlinePaths();
    await testExpansionRewardsAndExpiry();
    await testNonBlockingTickQueue();
    console.log('All imperial mandate tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
