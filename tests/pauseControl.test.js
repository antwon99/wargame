const assert = require('assert');

async function testPausedStopsOverworldTick() {
    const { advanceOverworldTimer } = await import('../scripts/overworldTicks.js');
    const { Timekeeper } = await import('../scripts/timekeeper.js');

    const game = {
        paused: true,
        overworld: {
            timer: 0,
            tickRate: 1,
            hexes: new Map([
                ['castle', { type: 'castle', owner: 'player' }],
                ['town', { type: 'town', owner: 'player' }]
            ])
        },
        research: { bonuses: { townGoldBonus: 0, forestWoodBonus: 0 } },
        upgrades: { mines: 1 },
        gold: 0,
        wood: 0,
        timekeeper: new Timekeeper({ startTick: 0 }),
        getIncomeMulti() { return 1; },
        updateHUDCalls: 0,
        updateUpgradeMenuCalls: 0,
        updateHUD() { this.updateHUDCalls += 1; },
        updateUpgradeMenu() { this.updateUpgradeMenuCalls += 1; }
    };

    let mandateTicks = 0;
    advanceOverworldTimer(game, 2, { mandateManager: { advanceTick: () => { mandateTicks += 1; } } });

    assert.strictEqual(game.gold, 0, 'gold should not change while paused');
    assert.strictEqual(game.wood, 0, 'wood should not change while paused');
    assert.strictEqual(game.timekeeper.ticks, 0, 'calendar should not advance while paused');
    assert.strictEqual(mandateTicks, 0, 'mandate manager should not receive ticks while paused');
    assert.strictEqual(game.updateHUDCalls, 0, 'HUD should not update when nothing advances');
    assert.strictEqual(game.updateUpgradeMenuCalls, 0, 'upgrade UI should remain untouched');
}

async function testUnpausedAppliesIncomeAndMandates() {
    const { advanceOverworldTimer } = await import('../scripts/overworldTicks.js');
    const { Timekeeper } = await import('../scripts/timekeeper.js');

    const game = {
        paused: false,
        overworld: {
            timer: 0,
            tickRate: 1,
            hexes: new Map([
                ['castle', { type: 'castle', owner: 'player' }],
                ['town', { type: 'town', owner: 'player' }],
                ['forest', { type: 'forest', owner: 'player' }]
            ])
        },
        research: { bonuses: { townGoldBonus: 0, forestWoodBonus: 1 } },
        upgrades: { mines: 1 },
        gold: 0,
        wood: 0,
        timekeeper: new Timekeeper({ startTick: 0 }),
        getIncomeMulti() { return 1; },
        updateHUDCalls: 0,
        updateUpgradeMenuCalls: 0,
        spawnTxtCalls: [],
        updateHUD() { this.updateHUDCalls += 1; },
        updateUpgradeMenu() { this.updateUpgradeMenuCalls += 1; },
        spawnTxt(_, txt) { this.spawnTxtCalls.push(txt); }
    };

    let mandateTicks = 0;
    const uiBindings = { enqueueNotification: () => {} };
    advanceOverworldTimer(game, 1.5, {
        mandateManager: { advanceTick: (_game, bindings) => {
            mandateTicks += 1;
            assert.strictEqual(bindings.enqueueNotification, uiBindings.enqueueNotification);
        } },
        uiBindings
    });

    assert.strictEqual(game.gold, 6, 'castle and town income should apply when unpaused');
    assert.strictEqual(game.wood, 4, 'forest and castle wood should apply with bonuses');
    assert.strictEqual(game.timekeeper.ticks, 1, 'calendar should advance by one tick when economy runs');
    assert.ok(game.spawnTxtCalls.length > 0, 'income text should display when resources change');
    assert.strictEqual(mandateTicks, 1, 'mandate manager should receive ticks when unpaused');
    assert.strictEqual(game.updateHUDCalls, 1, 'HUD should refresh after income ticks');
    assert.strictEqual(game.updateUpgradeMenuCalls, 1, 'upgrade UI should refresh after income ticks');
}

async function testPausePreservesTimerProgress() {
    const { advanceOverworldTimer } = await import('../scripts/overworldTicks.js');

    const game = {
        paused: false,
        overworld: { timer: 0, tickRate: 2, hexes: new Map() },
        research: { bonuses: {} },
        upgrades: {},
        gold: 0,
        wood: 0,
        getIncomeMulti() { return 1; }
    };

    let mandateTicks = 0;
    const options = { mandateManager: { advanceTick: () => { mandateTicks += 1; } } };

    const beforePause = advanceOverworldTimer(game, 1, options);
    assert.strictEqual(beforePause, false, 'timer should not tick until the cadence threshold is met');
    assert.strictEqual(game.overworld.timer, 1, 'partial timer progress should be cached');

    game.paused = true;
    const whilePaused = advanceOverworldTimer(game, 1, options);
    assert.strictEqual(whilePaused, false, 'paused flag should block tick application');
    assert.strictEqual(game.overworld.timer, 1, 'pause should not discard cached timer progress');

    game.paused = false;
    const afterResume = advanceOverworldTimer(game, 1, options);
    assert.strictEqual(afterResume, true, 'resume should apply the deferred tick');
    assert.strictEqual(game.overworld.timer, 0, 'timer should reset after applying income');
    assert.strictEqual(mandateTicks, 1, 'mandate manager should receive deferred ticks after resuming');
}

async function testLargeDeltaAppliesMultipleTicks() {
    const { advanceOverworldTimer } = await import('../scripts/overworldTicks.js');
    const { Timekeeper } = await import('../scripts/timekeeper.js');

    const game = {
        paused: false,
        overworld: {
            timer: 0,
            tickRate: 1,
            hexes: new Map([
                ['castle', { type: 'castle', owner: 'player' }],
                ['town', { type: 'town', owner: 'player' }],
                ['forest', { type: 'forest', owner: 'player' }]
            ])
        },
        research: { bonuses: { townGoldBonus: 0, forestWoodBonus: 1 } },
        upgrades: { mines: 1 },
        gold: 0,
        wood: 0,
        timekeeper: new Timekeeper({ startTick: 0 }),
        getIncomeMulti() { return 1; },
        updateHUDCalls: 0,
        updateUpgradeMenuCalls: 0,
        updateHUD() { this.updateHUDCalls += 1; },
        updateUpgradeMenu() { this.updateUpgradeMenuCalls += 1; }
    };

    let mandateTicks = 0;
    advanceOverworldTimer(game, 2.5, { mandateManager: { advanceTick: () => { mandateTicks += 1; } } });

    assert.strictEqual(game.gold, 12, 'large delta should apply multiple income ticks');
    assert.strictEqual(game.wood, 8, 'large delta should apply multiple wood ticks');
    assert.strictEqual(game.timekeeper.ticks, 2, 'calendar should advance once per applied tick');
    assert.strictEqual(game.overworld.timer, 0.5, 'timer should retain leftover delta');
    assert.strictEqual(mandateTicks, 2, 'mandate manager should receive one call per tick');
    assert.strictEqual(game.updateHUDCalls, 2, 'HUD should refresh once per tick');
    assert.strictEqual(game.updateUpgradeMenuCalls, 2, 'upgrade UI should refresh once per tick');
}

async function run() {
    await testPausedStopsOverworldTick();
    await testUnpausedAppliesIncomeAndMandates();
    await testPausePreservesTimerProgress();
    await testLargeDeltaAppliesMultipleTicks();
    console.log('Pause control tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
