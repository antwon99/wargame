const assert = require('assert');
const RebelSystem = require('../scripts/rebelSystem.js');
const ImperialMandates = require('../scripts/imperialMandates.js');
const ImperialMandateManager = require('../scripts/imperialMandateManager.js');
const ImperialMandateCalendar = require('../scripts/imperialMandateCalendar.js');

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
        upgrades: { soldier: 1, archer: 1, production: 1, mines: 1, defense: 1 },
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
    const modals = [];
    return {
        notifications,
        modals,
        uiBindings: {
            enqueueNotification: (payload) => notifications.push(payload),
            showImperialModal: (config) => modals.push(config)
        }
    };
}

function clearFrontierSweep(gameState, uiBindings) {
    const rebelKey = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp.metadata.targetTileKey;
    const rebelTile = gameState.overworld.hexes.get(rebelKey);
    ImperialMandates.recordEvent('tile_cleared', { tile: rebelTile }, gameState, uiBindings);
    return rebelTile;
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
    gameState.upgrades.production = 2;
    gameState.upgrades.mines = 2;
    const expansionDelay = ImperialMandateCalendar.convertToTicks({ weeks: 2, days: 4 }, gameState);

    const { notifications, uiBindings } = buildNotificationBindings();
    uiBindings.showImperialModal = (config) => notifications.push(config);
    ImperialMandates.issuePendingMandates(gameState, uiBindings);

    let state = ImperialMandates.getKingState().mandates;
    assert.strictEqual(state.destroy_first_rebel_camp.status, ImperialMandates.MandateStatus.ACTIVE, 'rebel mandate should issue immediately when overworld exists');
    assert.strictEqual(state.levy_tithed_gold.status, ImperialMandates.MandateStatus.PENDING, 'levy should wait for early ticks before triggering');
    assert.strictEqual(state.push_the_frontier.status, ImperialMandates.MandateStatus.PENDING, 'expansion mandate should wait for its trigger window');
    assert.strictEqual(state.destroy_first_rebel_camp.deadlineTick, state.destroy_first_rebel_camp.issuedTick + 21, 'rebel mandate should set a deadline from issuance');

    await advanceImperialTicks(10, gameState, uiBindings);
    state = ImperialMandates.getKingState().mandates;
    assert.strictEqual(state.levy_tithed_gold.status, ImperialMandates.MandateStatus.PENDING, 'levy should remain gated until the frontier sweep is cleared');

    const rebelTile = clearFrontierSweep(gameState, uiBindings);
    const completionTick = ImperialMandates.getKingState().currentTick;
    const levyGrace = ImperialMandateCalendar.convertToTicks({ weeks: 2, days: 2 }, gameState);

    await advanceImperialTicks(levyGrace, gameState, uiBindings);
    state = ImperialMandates.getKingState().mandates;
    assert.strictEqual(state.levy_tithed_gold.status, ImperialMandates.MandateStatus.ACTIVE, 'levy mandate should issue after the post-rebel grace window when thresholds are met');
    assert.strictEqual(state.levy_tithed_gold.deadlineTick, state.levy_tithed_gold.issuedTick + 11, 'levy deadline should be based on durationTicks');

    const spacing = ImperialMandateCalendar.getMinimumMandateSpacing(gameState);
    const pushEarliest = Math.max(completionTick + expansionDelay, ImperialMandates.getKingState().lastIssuedTick + spacing);
    const ticksUntilPush = Math.max(0, pushEarliest - ImperialMandates.getKingState().currentTick - 1);
    if (ticksUntilPush > 0) await advanceImperialTicks(ticksUntilPush, gameState, uiBindings);
    state = ImperialMandates.getKingState().mandates;
    assert.strictEqual(state.push_the_frontier.status, ImperialMandates.MandateStatus.PENDING, 'expansion mandate should wait for rebel sweep completion and the post-sweep timer');

    await advanceImperialTicks(1, gameState, uiBindings);
    state = ImperialMandates.getKingState().mandates;
    assert.strictEqual(state.push_the_frontier.status, ImperialMandates.MandateStatus.ACTIVE, 'expansion mandate should issue after the sweep completion delay window');
    assert.ok(ImperialMandates.getKingState().currentTick >= pushEarliest, 'expansion mandate should respect the new earliest issue timing');
    assert.strictEqual(state.push_the_frontier.deadlineTick, state.push_the_frontier.issuedTick + 17, 'expansion deadline should be based on durationTicks');
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
    const rebelSweepSuccess = ImperialMandates.getKingState().rebelSweep;
    assert.strictEqual(rebelSweepSuccess.outcome, ImperialMandates.MandateStatus.SUCCEEDED, 'rebel sweep outcome should be recorded on success');
    assert.strictEqual(rebelSweepSuccess.completionTick, finalState.completedTick, 'rebel sweep completion tick should mirror the mandate completion');

    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const stubbornGame = buildGameState();
    ImperialMandates.issuePendingMandates(stubbornGame, uiBindings);
    await advanceImperialTicks(22, stubbornGame, uiBindings);
    const failedState = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp;
    assert.strictEqual(failedState.status, ImperialMandates.MandateStatus.FAILED, 'rebel mandate should fail when deadline is exceeded');
    const rebelSweepFailure = ImperialMandates.getKingState().rebelSweep;
    assert.strictEqual(rebelSweepFailure.outcome, ImperialMandates.MandateStatus.FAILED, 'rebel sweep outcome should be recorded on failure');
    assert.strictEqual(rebelSweepFailure.completionTick, failedState.completedTick, 'rebel sweep failure should note the completion tick');
}

async function testMandatesCycleAfterRebelFailure() {
    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const gameState = buildGameState();
    gameState.gold = 220;
    gameState.upgrades.production = 2;
    gameState.upgrades.mines = 2;
    const { uiBindings } = buildNotificationBindings();

    ImperialMandates.issuePendingMandates(gameState, uiBindings);
    await advanceImperialTicks(22, gameState, uiBindings);

    const failedState = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp;
    assert.strictEqual(failedState.status, ImperialMandates.MandateStatus.FAILED, 'frontier sweep should fail when deadline expires');

    const completionTick = ImperialMandates.getKingState().currentTick;
    const levyGrace = ImperialMandateCalendar.convertToTicks({ weeks: 2, days: 2 }, gameState);
    const spacing = ImperialMandateCalendar.getMinimumMandateSpacing(gameState);
    const earliestLevy = completionTick + levyGrace;
    const spacingGate = ImperialMandates.getKingState().lastIssuedTick + spacing;
    const ticksUntilLevy = Math.max(0, Math.max(earliestLevy, spacingGate) - ImperialMandates.getKingState().currentTick - 1);
    if (ticksUntilLevy > 0) await advanceImperialTicks(ticksUntilLevy, gameState, uiBindings);

    await advanceImperialTicks(1, gameState, uiBindings);
    const levyState = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    assert.strictEqual(levyState.status, ImperialMandates.MandateStatus.ACTIVE, 'levy mandates should still issue after a failed frontier sweep');
}

async function testFirstDecreeAnchoredThenNotifications() {
    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const gameState = buildGameState();
    const { notifications, uiBindings } = buildNotificationBindings();
    const callouts = [];
    const bindings = {
        ...uiBindings,
        showTileCallout: (...args) => callouts.push(args),
        hideTileCallout: () => null
    };

    ImperialMandates.issuePendingMandates(gameState, bindings);
    assert.strictEqual(callouts.length, 1, 'first rebel camp should use anchored decree callout');
    assert.strictEqual(notifications.length, 0, 'initial decree should avoid notification stack');

    const options = callouts[0][callouts[0].length - 1];
    assert.strictEqual(options.title, 'By Imperial Decree:', 'anchored callout should set the decree title');
    assert.ok(options.body.includes('Patrol the frontier'), 'anchored callout should include the decree body');
    assert.strictEqual(options.buttonText, 'Understood', 'anchored callout should include a dismissal button');

    const targetKey = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp.metadata.targetTileKey;
    const rebelTile = gameState.overworld.hexes.get(targetKey);
    ImperialMandates.recordEvent('battle_outcome', { result: 'DEFEAT', targetTile: rebelTile }, gameState, bindings);
    ImperialMandates.recordEvent('battle_outcome', { result: 'VICTORY', targetTile: rebelTile }, gameState, bindings);

    assert.ok(notifications.length >= 2, 'reprimands and completion should enqueue follow-up notifications');
    const titles = notifications.map((msg) => msg.title);
    assert.ok(titles.includes('Imperial Reprimand'), 'reprimand should use the notification stack');
    assert.ok(titles.includes('The Emperor is pleased.'), 'success message should route through the notification stack');
}

function testEmptyBodyDecreeDefaultsAndSilencesAudio() {
    ImperialMandates.resetForNewCampaign();
    const playLog = [];
    const callouts = [];
    const gameState = buildGameState();
    gameState.playSound = (key) => playLog.push(key);

    const rebelTile = { hex: new Hex(0, 0), type: 'rebelcamp' };
    const uiBindings = {
        playSound: (key) => playLog.push(key),
        showTileCallout: (...args) => callouts.push(args),
        hideTileCallout: () => null
    };

    const rendered = ImperialMandates.showRebelDecreeCallout(rebelTile, gameState, uiBindings, { body: '', autoHide: true });
    assert.ok(rendered, 'tile callout should render when bindings are present');
    const calloutOptions = callouts[0]?.[callouts[0].length - 1] || {};
    assert.ok(calloutOptions.body.includes('Patrol the frontier'), 'empty bodies should fall back to default decree copy');
    assert.strictEqual(playLog.includes('wardrum'), false, 'decrees should not trigger combat cues');
    assert.strictEqual(playLog.length, 0, 'imperial decree rendering should be UI-only with no audio overlap');
}

async function testTaxLevyDeadlinePaths() {
    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const gameState = buildGameState();
    gameState.gold = 220;
    gameState.upgrades.production = 2;
    gameState.upgrades.soldier = 2;
    const earlyCycle = buildNotificationBindings();
    const hudUpdates = [];
    const successBindings = { ...earlyCycle.uiBindings, updateHUD: (state) => hudUpdates.push(state.imperialFavor) };
    ImperialMandates.issuePendingMandates(gameState, successBindings);

    clearFrontierSweep(gameState, successBindings);

    await advanceImperialTicks(16, gameState, successBindings);
    const levyState = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    const goldBeforePayment = gameState.gold;
    assert.strictEqual(levyState.status, ImperialMandates.MandateStatus.ACTIVE, 'levy should activate after early ticks');

    const confirmResult = ImperialMandates.confirmMandateResources('levy_tithed_gold', gameState, successBindings);
    assert.ok(confirmResult.ok, 'levy confirmation should succeed once resources are ready');
    const resolvedLevy = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    assert.strictEqual(resolvedLevy.status, ImperialMandates.MandateStatus.SUCCEEDED, 'levy should succeed once funds are ready');
    assert.ok(gameState.gold < goldBeforePayment, 'levy payout should reduce total gold');
    assert.strictEqual(gameState.imperialFavor, 7, 'successful levy should raise imperial favor');
    assert.ok(hudUpdates.includes(7), 'HUD should refresh after favor increases');

    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const struggling = buildGameState();
    struggling.gold = 130;
    struggling.upgrades.production = 2;
    struggling.upgrades.soldier = 2;
    const strugglingNotifications = buildNotificationBindings();
    const failureHudUpdates = [];
    const failureBindings = { ...strugglingNotifications.uiBindings, updateHUD: (state) => failureHudUpdates.push(state.imperialFavor) };
    ImperialMandates.issuePendingMandates(struggling, failureBindings);
    clearFrontierSweep(struggling, failureBindings);
    await advanceImperialTicks(16, struggling, failureBindings);
    const failingLevy = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    assert.strictEqual(failingLevy.status, ImperialMandates.MandateStatus.ACTIVE, 'levy should activate for struggling treasury');
    const favorBeforeDeadlines = struggling.imperialFavor ?? 5;
    await advanceImperialTicks(12, struggling, failureBindings);
    const failedState = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    assert.strictEqual(failedState.status, ImperialMandates.MandateStatus.FAILED, 'levy should fail after deadline expires');
    assert.ok(struggling.gold <= 130, 'failure should seize part of the treasury');
    assert.ok(struggling.imperialFavor <= favorBeforeDeadlines - 1, 'missed levy should lower imperial favor');
    assert.ok(failureHudUpdates.includes(struggling.imperialFavor), 'HUD should refresh after favor penalties');
}

async function testExpansionRewardsAndExpiry() {
    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const gameState = buildGameState();
    const { uiBindings } = buildNotificationBindings();
    ImperialMandates.issuePendingMandates(gameState, uiBindings);
    const rebelTarget = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp.metadata.targetTileKey;
    const rebelTile = gameState.overworld.hexes.get(rebelTarget);
    ImperialMandates.recordEvent('tile_cleared', { tile: rebelTile }, gameState, uiBindings);
    await advanceImperialTicks(20, gameState, uiBindings);
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
    ImperialMandates.issuePendingMandates(stalled, uiBindings);
    const stalledRebel = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp.metadata.targetTileKey;
    ImperialMandates.recordEvent('tile_cleared', { tile: stalled.overworld.hexes.get(stalledRebel) }, stalled, uiBindings);
    await advanceImperialTicks(20, stalled, uiBindings);
    const stalledMandate = ImperialMandates.getKingState().mandates.push_the_frontier;
    assert.strictEqual(stalledMandate.status, ImperialMandates.MandateStatus.ACTIVE, 'expansion mandate should be active before expiry');
    await advanceImperialTicks(18, stalled, uiBindings);
    const expired = ImperialMandates.getKingState().mandates.push_the_frontier;
    assert.strictEqual(expired.status, ImperialMandates.MandateStatus.FAILED, 'expansion mandate should fail when deadline passes without growth');
}

async function testInfrastructureQuotaPaths() {
    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const gameState = buildGameState();
    gameState.imperialFavor = 5;
    gameState.gold = 260;
    gameState.wood = 120;
    const { uiBindings, modals } = buildNotificationBindings();
    ImperialMandates.issuePendingMandates(gameState, uiBindings);
    const rebelTarget = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp.metadata.targetTileKey;
    ImperialMandates.recordEvent('tile_cleared', { tile: gameState.overworld.hexes.get(rebelTarget) }, gameState, uiBindings);
    const infrastructureEarliest = ImperialMandateCalendar.convertToTicks({ weeks: 2, days: 3 }, gameState);
    const spacing = ImperialMandateCalendar.getMinimumMandateSpacing(gameState);
    await advanceImperialTicks(spacing, gameState, uiBindings);
    await advanceImperialTicks(1, gameState, uiBindings);
    await advanceImperialTicks(infrastructureEarliest, gameState, uiBindings);
    ImperialMandates.issuePendingMandates(gameState, uiBindings);
    if (ImperialMandates.getKingState().mandates.infrastructure_quota.status === ImperialMandates.MandateStatus.PENDING) {
        await advanceImperialTicks(ImperialMandateCalendar.getMinimumMandateSpacing(gameState), gameState, uiBindings);
        ImperialMandates.issuePendingMandates(gameState, uiBindings);
    }
    let quota = ImperialMandates.getKingState().mandates.infrastructure_quota;
    assert.strictEqual(quota.status, ImperialMandates.MandateStatus.ACTIVE, 'infrastructure quota should activate after stockpile trigger');

    const initialModal = modals.find((modal) => modal.title === 'Infrastructure Quota');
    assert.ok(initialModal, 'quota issuance should present an interactive modal');
    assert.ok(initialModal.lines.some((line) => line.includes(`${quota.metadata.targetWood} wood`)), 'quota modal should list target wood');
    assert.ok(initialModal.lines.some((line) => line.includes(`${quota.metadata.targetGold} gold`)), 'quota modal should list target gold');

    const { targetGold, targetWood } = quota.metadata;
    gameState.gold = targetGold;
    gameState.wood = targetWood;
    await advanceImperialTicks(1, gameState, uiBindings);
    quota = ImperialMandates.getKingState().mandates.infrastructure_quota;
    assert.strictEqual(quota.status, ImperialMandates.MandateStatus.ACTIVE, 'quota should wait for acceptance even when staged');
    assert.strictEqual(gameState.gold, targetGold, 'gold should not change until the quota is accepted');
    assert.strictEqual(gameState.wood, targetWood, 'wood should not change until the quota is accepted');

    const acceptanceModal = modals.filter((modal) => modal.title === 'Infrastructure Quota').pop();
    assert.ok(acceptanceModal?.onConfirm, 'ready modal should expose an acceptance handler');
    acceptanceModal.onConfirm();
    quota = ImperialMandates.getKingState().mandates.infrastructure_quota;
    assert.strictEqual(quota.status, ImperialMandates.MandateStatus.SUCCEEDED, 'quota should succeed after explicit acceptance');
    assert.strictEqual(gameState.gold, 50, 'acceptance should withdraw staged gold before the stipend');
    assert.strictEqual(gameState.wood, 30, 'acceptance should withdraw staged wood before the stipend');
    assert.strictEqual(gameState.imperialFavor, 8, 'quota success should boost imperial favor after early victories');

    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const failing = buildGameState();
    failing.imperialFavor = 5;
    failing.gold = 200;
    failing.wood = 90;
    ImperialMandates.issuePendingMandates(failing, uiBindings);
    clearFrontierSweep(failing, uiBindings);
    const failingEarliest = ImperialMandateCalendar.convertToTicks({ weeks: 2, days: 3 }, failing);
    const failingSpacing = ImperialMandateCalendar.getMinimumMandateSpacing(failing);
    await advanceImperialTicks(failingSpacing + failingEarliest, failing, uiBindings);
    ImperialMandates.issuePendingMandates(failing, uiBindings);
    let failedQuota = ImperialMandates.getKingState().mandates.infrastructure_quota;
    if (failedQuota.status === ImperialMandates.MandateStatus.PENDING) {
        await advanceImperialTicks(failingSpacing, failing, uiBindings);
        ImperialMandates.issuePendingMandates(failing, uiBindings);
        failedQuota = ImperialMandates.getKingState().mandates.infrastructure_quota;
    }
    assert.strictEqual(failedQuota.status, ImperialMandates.MandateStatus.ACTIVE, 'quota should activate when stockpiles exist after the sweep');

    const ticksUntilExpiry = (failedQuota.deadlineTick || failingEarliest) - ImperialMandates.getKingState().currentTick + 2;
    await advanceImperialTicks(Math.max(0, ticksUntilExpiry), failing, uiBindings);
    ImperialMandates.issuePendingMandates(failing, uiBindings);
    failedQuota = ImperialMandates.getKingState().mandates.infrastructure_quota;
    assert.strictEqual(failedQuota.status, ImperialMandates.MandateStatus.FAILED, 'quota should fail if inspectors are ignored');
    assert.ok((failing.imperialFavor || 0) <= 3, 'quota failure should reduce imperial favor');
}

async function testRotatingLevyMandate() {
    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const gameState = buildGameState();
    addTerritory(gameState, 2);
    gameState.gold = 180;
    gameState.wood = 180;
    const { uiBindings } = buildNotificationBindings();
    ImperialMandates.issuePendingMandates(gameState, uiBindings);

    const rebelTarget = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp.metadata.targetTileKey;
    const rebelTile = gameState.overworld.hexes.get(rebelTarget);
    ImperialMandates.recordEvent('tile_cleared', { tile: rebelTile }, gameState, uiBindings);

    await advanceImperialTicks(10, gameState, uiBindings);
    await advanceImperialTicks(1, gameState, uiBindings);
    await advanceImperialTicks(10, gameState, uiBindings);
    await advanceImperialTicks(10, gameState, uiBindings);
    await advanceImperialTicks(10, gameState, uiBindings);
    ImperialMandates.issuePendingMandates(gameState, uiBindings);
    let levy = ImperialMandates.getKingState().mandates.rotating_resource_levy;
    assert.strictEqual(levy.status, ImperialMandates.MandateStatus.ACTIVE, 'rotating levy should activate once holdings and stockpiles qualify');
    const { resourceType, requiredAmount } = levy.metadata;
    gameState[resourceType] = requiredAmount;
    const favorBeforeTribute = gameState.imperialFavor || 0;
    const confirmResult = ImperialMandates.confirmMandateResources('rotating_resource_levy', gameState, uiBindings);
    assert.ok(confirmResult.ok, 'rotating levy should confirm once resources are ready');
    levy = ImperialMandates.getKingState().mandates.rotating_resource_levy;
    assert.strictEqual(levy.status, ImperialMandates.MandateStatus.SUCCEEDED, 'levy should resolve when the tribute is ready');
    assert.strictEqual(gameState[resourceType], Math.floor(requiredAmount * 0.35), 'levy should deduct the tribute and return a rebate');
    assert.ok(gameState.imperialFavor >= favorBeforeTribute + 1, 'levy success should lightly improve favor');

    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const debtor = buildGameState();
    addTerritory(debtor, 2);
    debtor.gold = 220;
    debtor.wood = 220;
    ImperialMandates.issuePendingMandates(debtor, uiBindings);
    const debtorRebel = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp.metadata.targetTileKey;
    const debtorRebelTile = debtor.overworld.hexes.get(debtorRebel);
    ImperialMandates.recordEvent('tile_cleared', { tile: debtorRebelTile }, debtor, uiBindings);
    await advanceImperialTicks(10, debtor, uiBindings);
    await advanceImperialTicks(1, debtor, uiBindings);
    await advanceImperialTicks(10, debtor, uiBindings);
    await advanceImperialTicks(10, debtor, uiBindings);
    await advanceImperialTicks(10, debtor, uiBindings);
    ImperialMandates.issuePendingMandates(debtor, uiBindings);
    const failingLevy = ImperialMandates.getKingState().mandates.rotating_resource_levy;
    const penaltyType = failingLevy.metadata.resourceType;
    const reserveBeforeDefault = debtor[penaltyType];
    const favorBeforeDefault = debtor.imperialFavor || 0;
    await advanceImperialTicks(15, debtor, uiBindings);
    const failed = ImperialMandates.getKingState().mandates.rotating_resource_levy;
    const expectedPenalty = Math.max(30, Math.floor(failed.metadata.requiredAmount * 0.25));
    assert.strictEqual(failed.status, ImperialMandates.MandateStatus.FAILED, 'levy should fail when tribute is missed');
    assert.ok((reserveBeforeDefault - debtor[penaltyType]) >= expectedPenalty, 'levy failure should seize a sizable portion of the reserve');
    assert.ok((debtor.imperialFavor || 0) <= favorBeforeDefault - 1, 'levy failure should lower favor');
}

async function testRecurringMandatesReenterQueue() {
    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const gameState = buildGameState();
    gameState.gold = 260;
    gameState.wood = 140;
    gameState.upgrades.production = 2;
    gameState.upgrades.mines = 2;
    const { uiBindings } = buildNotificationBindings();
    ImperialMandates.issuePendingMandates(gameState, uiBindings);
    clearFrontierSweep(gameState, uiBindings);

    const spacing = ImperialMandateCalendar.getMinimumMandateSpacing(gameState);
    const levyWindow = ImperialMandateCalendar.convertToTicks({ weeks: 2, days: 2 }, gameState);
    await advanceImperialTicks(spacing + levyWindow + 2, gameState, uiBindings);
    let levy = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    assert.strictEqual(levy.status, ImperialMandates.MandateStatus.ACTIVE, 'levy should activate after the pacing window');
    const firstIssuance = levy.issuedTick;

    const confirmResult = ImperialMandates.confirmMandateResources('levy_tithed_gold', gameState, uiBindings);
    assert.ok(confirmResult.ok, 'levy should confirm when reserves cover the tribute');
    levy = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    assert.strictEqual(levy.status, ImperialMandates.MandateStatus.SUCCEEDED, 'levy should complete when reserves cover the tribute');

    ImperialMandates.issuePendingMandates(gameState, uiBindings);
    levy = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    assert.strictEqual(levy.status, ImperialMandates.MandateStatus.SUCCEEDED, 'levy should cool down before immediately reissuing');

    gameState.gold = (levy.metadata.requiredGold || 0) + 260;
    await advanceImperialTicks(spacing, gameState, uiBindings);
    ImperialMandates.issuePendingMandates(gameState, uiBindings);
    levy = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    assert.strictEqual(levy.status, ImperialMandates.MandateStatus.ACTIVE, 'levy should re-enter the queue after its cooldown elapses');
    assert.ok(ImperialMandates.getKingState().lastIssuedTick >= firstIssuance + spacing, 'reissued levy should respect mandate spacing');
}

async function testFavorScaledResourceRequests() {
    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const generous = buildGameState();
    generous.gold = 240;
    generous.wood = 140;
    generous.imperialFavor = 9;
    generous.upgrades.production = 2;
    generous.upgrades.mines = 2;
    const { uiBindings } = buildNotificationBindings();
    ImperialMandates.issuePendingMandates(generous, uiBindings);
    clearFrontierSweep(generous, uiBindings);
    const pacing = ImperialMandateCalendar.getMinimumMandateSpacing(generous);
    const levyDelay = ImperialMandateCalendar.convertToTicks({ weeks: 2, days: 2 }, generous);
    await advanceImperialTicks(pacing + levyDelay + 2, generous, uiBindings);
    const generousLevy = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    const generousRequirement = generousLevy.metadata.requiredGold;
    const generousDuration = generousLevy.deadlineTick - generousLevy.issuedTick;

    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const strained = buildGameState();
    strained.gold = 240;
    strained.wood = 140;
    strained.imperialFavor = 2;
    strained.upgrades.production = 2;
    strained.upgrades.mines = 2;
    ImperialMandates.issuePendingMandates(strained, uiBindings);
    clearFrontierSweep(strained, uiBindings);
    await advanceImperialTicks(pacing + levyDelay + 2, strained, uiBindings);
    const strainedLevy = ImperialMandates.getKingState().mandates.levy_tithed_gold;
    const strainedRequirement = strainedLevy.metadata.requiredGold;
    const strainedDuration = strainedLevy.deadlineTick - strainedLevy.issuedTick;

    assert.ok(strainedRequirement > generousRequirement, 'lower favor should increase the tribute size');
    assert.ok(generousDuration >= strainedDuration, 'higher favor should grant at least as much time as low favor');
}

async function testDiplomaticEnvoysMandate() {
    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const gameState = buildGameState();
    gameState.gold = 160;
    gameState.imperialFavor = 6;
    const { uiBindings } = buildNotificationBindings();
    ImperialMandates.issuePendingMandates(gameState, uiBindings);
    const envoyRebel = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp.metadata.targetTileKey;
    const envoyRebelTile = gameState.overworld.hexes.get(envoyRebel);
    ImperialMandates.recordEvent('tile_cleared', { tile: envoyRebelTile }, gameState, uiBindings);

    await advanceImperialTicks(10, gameState, uiBindings);
    await advanceImperialTicks(1, gameState, uiBindings);
    await advanceImperialTicks(10, gameState, uiBindings);
    await advanceImperialTicks(10, gameState, uiBindings);
    let envoys = ImperialMandates.getKingState().mandates.diplomatic_envoys;
    assert.strictEqual(envoys.status, ImperialMandates.MandateStatus.ACTIVE, 'diplomatic envoys mandate should activate when favor is high enough');
    const { targetFavor, giftCost } = envoys.metadata;
    const favorBeforeEnvoys = gameState.imperialFavor || 0;
    gameState.imperialFavor = targetFavor;
    gameState.gold = giftCost;
    const confirmResult = ImperialMandates.confirmMandateResources('diplomatic_envoys', gameState, uiBindings);
    assert.ok(confirmResult.ok, 'envoy confirmation should succeed once favor and gifts are ready');
    envoys = ImperialMandates.getKingState().mandates.diplomatic_envoys;
    assert.strictEqual(envoys.status, ImperialMandates.MandateStatus.SUCCEEDED, 'envoy mandate should succeed when favor and gifts align');
    assert.strictEqual(gameState.gold, 0, 'envoy gifts should deduct the treasury');
    assert.ok(gameState.wood >= 25, 'envoy success should return tribute timber');
    assert.ok(gameState.imperialFavor >= favorBeforeEnvoys + 2, 'envoy success should add favor to the meter');

    ImperialMandates.resetForNewCampaign();
    ImperialMandateManager.reset();
    const cooledRelations = buildGameState();
    cooledRelations.gold = 120;
    cooledRelations.imperialFavor = 6;
    ImperialMandates.issuePendingMandates(cooledRelations, uiBindings);
    const cooledRebel = ImperialMandates.getKingState().mandates.destroy_first_rebel_camp.metadata.targetTileKey;
    const cooledRebelTile = cooledRelations.overworld.hexes.get(cooledRebel);
    ImperialMandates.recordEvent('tile_cleared', { tile: cooledRebelTile }, cooledRelations, uiBindings);
    await advanceImperialTicks(10, cooledRelations, uiBindings);
    await advanceImperialTicks(1, cooledRelations, uiBindings);
    await advanceImperialTicks(10, cooledRelations, uiBindings);
    await advanceImperialTicks(10, cooledRelations, uiBindings);
    const favorBeforeEnvoyExpiry = cooledRelations.imperialFavor || 0;
    cooledRelations.imperialFavor = 4;
    await advanceImperialTicks(10, cooledRelations, uiBindings);
    const failedEnvoys = ImperialMandates.getKingState().mandates.diplomatic_envoys;
    assert.strictEqual(failedEnvoys.status, ImperialMandates.MandateStatus.FAILED, 'envoys should fail if favor drops before the deadline');
    assert.ok((cooledRelations.imperialFavor || 0) <= favorBeforeEnvoyExpiry - 2, 'failed envoy mandate should reduce imperial favor');
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
    await testMandatesCycleAfterRebelFailure();
    testEmptyBodyDecreeDefaultsAndSilencesAudio();
    await testFirstDecreeAnchoredThenNotifications();
    await testTaxLevyDeadlinePaths();
    await testExpansionRewardsAndExpiry();
    await testInfrastructureQuotaPaths();
    await testRotatingLevyMandate();
    await testDiplomaticEnvoysMandate();
    await testRecurringMandatesReenterQueue();
    await testFavorScaledResourceRequests();
    await testNonBlockingTickQueue();
    console.log('All imperial mandate tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
