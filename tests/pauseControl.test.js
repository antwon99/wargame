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
        timekeeper: new Timekeeper(),
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
        timekeeper: new Timekeeper(),
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

    assert.strictEqual(game.gold, 4, 'castle and town income should apply when unpaused');
    assert.strictEqual(game.wood, 3, 'forest and castle wood should apply with bonuses');
    assert.strictEqual(game.timekeeper.ticks, 1, 'calendar should advance by one tick when economy runs');
    assert.ok(game.spawnTxtCalls.length > 0, 'income text should display when resources change');
    assert.strictEqual(mandateTicks, 1, 'mandate manager should receive ticks when unpaused');
    assert.strictEqual(game.updateHUDCalls, 1, 'HUD should refresh after income ticks');
    assert.strictEqual(game.updateUpgradeMenuCalls, 1, 'upgrade UI should refresh after income ticks');
}

async function run() {
    await testPausedStopsOverworldTick();
    await testUnpausedAppliesIncomeAndMandates();
    console.log('Pause control tests passed.');
}

run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
